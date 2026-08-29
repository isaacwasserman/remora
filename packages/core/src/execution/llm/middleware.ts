import type { JSONSchema7, LanguageModel, LanguageModelMiddleware } from "ai";
import { APICallError } from "ai";
import type { JSONSchema7Definition, JSONSchema7TypeName } from "json-schema";
import { estimateTokenCount } from "tokenx";

// =============================================================================
// Token-limit middleware for the Vercel AI SDK.
//
// Puts a hard cap on the number of (estimated) prompt tokens by truncating the
// *earliest* messages / message parts first. Text and reasoning parts may be
// partially truncated (their leading characters removed); all other part
// types are dropped atomically.
//
// Two layers of defense:
//   1. Proactive: `transformParams` truncates the prompt to `maxInputTokens`
//      before the first request is sent.
//   2. Reactive: `wrapGenerate` / `wrapStream` catch provider "context length
//      exceeded" errors, shrink the budget, re-truncate, and retry.
// =============================================================================

// -----------------------------------------------------------------------------
// Type derivation
//
// `LanguageModel` is `string | <model object>`. We derive every prompt type
// from the `LanguageModelMiddleware` hook signatures themselves rather than
// importing `LanguageModelVx*` types from `@ai-sdk/provider`. This pins the
// code to whatever single spec version the installed SDK's middleware uses
// (v4 in ai@7) and automatically tracks future spec bumps.
// -----------------------------------------------------------------------------

/** The non-string variant of `LanguageModel` (model IDs stripped). */
export type ResolvedLanguageModel = Exclude<LanguageModel, string>;

type WrapGenerateOptions = Parameters<
    NonNullable<LanguageModelMiddleware["wrapGenerate"]>
>[0];
/** The concrete model type middleware hooks receive (single spec version). */
type MiddlewareModel = WrapGenerateOptions["model"];
type CallOptions = WrapGenerateOptions["params"];
type Prompt = CallOptions["prompt"];
type Message = Prompt[number];

/** Union of all array-content parts across every message role. */
type Part = Exclude<Message["content"], string>[number];

type TextLikePart = Extract<Part, { type: "text" | "reasoning" }>;
type ToolResultPart = Extract<Part, { type: "tool-result" }>;
type ToolResultOutput = ToolResultPart["output"];
type ToolMessage = Extract<Message, { role: "tool" }>;
type ToolMessagePart = ToolMessage["content"][number];

function isTextLike(part: Part): part is TextLikePart {
    return part.type === "text" || part.type === "reasoning";
}

function isToolResult(part: Part): part is ToolResultPart {
    return part.type === "tool-result";
}

// -----------------------------------------------------------------------------
// Options
// -----------------------------------------------------------------------------

export interface TokenLimitMiddlewareOptions {
    /** Hard cap on estimated prompt tokens sent to the API. */
    maxInputTokens: number;

    /**
     * Return `false` to exempt a message from truncation entirely (it is
     * always kept and its tokens still count against the budget).
     * Defaults to: all messages are truncatable.
     */
    shouldTruncateMessage?: (
        message: Message,
        index: number,
        messages: readonly Message[],
    ) => boolean;

    /**
     * Return `false` to exempt an individual content part from truncation.
     * Only consulted for parts of messages that are themselves truncatable.
     * Defaults to: all parts are truncatable.
     */
    shouldTruncateMessagePart?: (
        part: Part,
        message: Message,
        partIndex: number,
    ) => boolean;

    /** Max reactive retries after a context-overflow error. Default 3. */
    maxRetries?: number;

    /**
     * Multiplier applied to the token budget on each reactive retry (the
     * provider error told us our estimate was too optimistic). Default 0.85.
     */
    reductionFactor?: number;

    /** Estimated token cost of a file/image part. Default 768. */
    fileTokenEstimate?: number;

    /** Fixed per-message overhead added to the estimate. Default 4. */
    perMessageOverhead?: number;

    /** Called whenever a truncation pass actually removes content. */
    onTruncate?: (info: {
        phase: "proactive" | "reactive";
        budget: number;
        estimatedTokensBefore: number;
        estimatedTokensAfter: number;
    }) => void;
}

// -----------------------------------------------------------------------------
// Token estimation
// -----------------------------------------------------------------------------

function safeStringify(value: unknown): string {
    try {
        return typeof value === "string"
            ? value
            : (JSON.stringify(value) ?? "");
    } catch {
        return "";
    }
}

function estimatePartTokens(part: Part, fileTokenEstimate: number): number {
    if (isTextLike(part)) {
        return estimateTokenCount(part.text);
    }
    switch (part.type) {
        case "tool-call":
            return (
                estimateTokenCount(part.toolName) +
                estimateTokenCount(safeStringify(part.input))
            );
        case "tool-result":
            return (
                estimateTokenCount(part.toolName) +
                estimateTokenCount(safeStringify(part.output))
            );
        case "file":
        case "reasoning-file":
            return fileTokenEstimate;
        default:
            // custom / tool-approval-response / future part types: estimate
            // from their serialized form.
            return estimateTokenCount(safeStringify(part));
    }
}

function estimateMessageTokens(
    message: Message,
    fileTokenEstimate: number,
    perMessageOverhead: number,
): number {
    if (typeof message.content === "string") {
        return perMessageOverhead + estimateTokenCount(message.content);
    }
    let sum = perMessageOverhead;
    for (const part of message.content) {
        sum += estimatePartTokens(part, fileTokenEstimate);
    }
    return sum;
}

function estimatePromptTokens(
    prompt: Prompt,
    fileTokenEstimate: number,
    perMessageOverhead: number,
): number {
    return prompt.reduce(
        (sum, m) =>
            sum +
            estimateMessageTokens(m, fileTokenEstimate, perMessageOverhead),
        0,
    );
}

/**
 * Returns the longest *suffix* of `text` whose estimated token count fits in
 * `budget` (earliest tokens are removed first). Binary search over suffix
 * length; tokenx estimation is monotone enough for this to be well-behaved.
 */
function trimTextToTokenBudget(text: string, budget: number): string {
    if (budget <= 0) return "";
    if (estimateTokenCount(text) <= budget) return text;

    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (estimateTokenCount(text.slice(text.length - mid)) <= budget) {
            lo = mid;
        } else {
            hi = mid - 1;
        }
    }
    return lo > 0 ? text.slice(text.length - lo) : "";
}

// -----------------------------------------------------------------------------
// Core truncation
// -----------------------------------------------------------------------------

interface TruncateContext {
    fileTokenEstimate: number;
    perMessageOverhead: number;
    shouldTruncateMessage:
        | TokenLimitMiddlewareOptions["shouldTruncateMessage"]
        | undefined;
    shouldTruncateMessagePart:
        | TokenLimitMiddlewareOptions["shouldTruncateMessagePart"]
        | undefined;
}

/**
 * Truncates `prompt` so its estimated token count is <= `budget`, removing
 * the earliest tokens first. Walks messages newest -> oldest, keeping what
 * fits. The message straddling the boundary is partially truncated: its
 * parts are kept newest -> oldest, and a boundary text/reasoning part has
 * its leading characters trimmed to spend the remaining budget.
 *
 * Messages / parts for which the callbacks return `false` are always kept
 * (their token cost still counts against the budget).
 */
function truncatePrompt(
    prompt: Prompt,
    budget: number,
    ctx: TruncateContext,
): Prompt {
    const {
        fileTokenEstimate,
        perMessageOverhead,
        shouldTruncateMessage,
        shouldTruncateMessagePart,
    } = ctx;

    // 1. Reserve budget for everything exempt from truncation.
    let remaining = budget;
    const exempt = prompt.map((m, i) =>
        shouldTruncateMessage ? !shouldTruncateMessage(m, i, prompt) : false,
    );
    for (let i = 0; i < prompt.length; i++) {
        if (exempt[i]) {
            remaining -= estimateMessageTokens(
                // biome-ignore lint/style/noNonNullAssertion: index checked by loop bound
                prompt[i]!,
                fileTokenEstimate,
                perMessageOverhead,
            );
        }
    }
    // If exempt content alone exceeds the budget there is nothing safe to cut
    // further without violating the caller's exemptions.
    remaining = Math.max(remaining, 0);

    // 2. Walk newest -> oldest over truncatable messages, spending the budget.
    const kept: (Message | null)[] = prompt.map((m, i) =>
        exempt[i] ? m : null,
    );

    let exhausted = false;
    for (let i = prompt.length - 1; i >= 0; i--) {
        if (exempt[i]) continue;
        // biome-ignore lint/style/noNonNullAssertion: index checked by loop bound
        const message = prompt[i]!;

        if (exhausted || remaining <= perMessageOverhead) {
            exhausted = true;
            continue; // drop entirely
        }

        const cost = estimateMessageTokens(
            message,
            fileTokenEstimate,
            perMessageOverhead,
        );
        if (cost <= remaining) {
            kept[i] = message;
            remaining -= cost;
            continue;
        }

        // Boundary message: partially truncate, then stop keeping older ones.
        kept[i] = partiallyTruncateMessage(
            message,
            remaining - perMessageOverhead,
            fileTokenEstimate,
            shouldTruncateMessagePart,
        );
        remaining = 0;
        exhausted = true;
    }

    return kept.filter((m): m is Message => m !== null);
}

/**
 * Keeps as much of the *end* of a message as fits in `budget`. Returns null
 * if nothing survives. String-content messages (system) are trimmed
 * directly; other roles have their parts walked newest -> oldest, with the
 * boundary text/reasoning part partially trimmed.
 */
function partiallyTruncateMessage(
    message: Message,
    budget: number,
    fileTokenEstimate: number,
    shouldTruncateMessagePart: TruncateContext["shouldTruncateMessagePart"],
): Message | null {
    if (budget <= 0) return null;

    if (message.role === "system") {
        const trimmed = trimTextToTokenBudget(message.content, budget);
        return trimmed.length > 0 ? { ...message, content: trimmed } : null;
    }

    const parts: readonly Part[] = message.content;

    // Reserve budget for exempt parts first.
    let remaining = budget;
    const exempt = parts.map((p, idx) =>
        shouldTruncateMessagePart
            ? !shouldTruncateMessagePart(p, message, idx)
            : false,
    );
    for (let i = 0; i < parts.length; i++) {
        if (exempt[i]) {
            // biome-ignore lint/style/noNonNullAssertion: index checked by loop bound
            remaining -= estimatePartTokens(parts[i]!, fileTokenEstimate);
        }
    }
    remaining = Math.max(remaining, 0);

    const keptParts: (Part | null)[] = parts.map((p, i) =>
        exempt[i] ? p : null,
    );

    let exhausted = false;
    for (let i = parts.length - 1; i >= 0; i--) {
        if (exempt[i]) continue;
        // biome-ignore lint/style/noNonNullAssertion: index checked by loop bound
        const part = parts[i]!;

        if (exhausted || remaining <= 0) {
            exhausted = true;
            continue;
        }

        const cost = estimatePartTokens(part, fileTokenEstimate);
        if (cost <= remaining) {
            keptParts[i] = part;
            remaining -= cost;
            continue;
        }

        // Boundary part: only text / reasoning may be partially truncated.
        if (isTextLike(part)) {
            const trimmed = trimTextToTokenBudget(part.text, remaining);
            if (trimmed.length > 0) {
                keptParts[i] = { ...part, text: trimmed };
            }
        }
        remaining = 0;
        exhausted = true;
    }

    const finalParts = keptParts.filter((p): p is Part => p !== null);
    if (finalParts.length === 0) return null;
    // Parts were only removed or text-trimmed, never moved across roles, so
    // the narrowed role/content pairing still holds at runtime.
    return { ...message, content: finalParts } as Message;
}

// -----------------------------------------------------------------------------
// Prompt sanitization
//
// After truncation the prompt can be structurally invalid: tool-results whose
// tool-call was truncated away, tool-calls whose result was dropped, empty
// messages, system messages no longer at the front, etc. These helpers mirror
// the ModelMessage[] sanitizers, ported to the provider-prompt shape.
// -----------------------------------------------------------------------------

/** System messages must form a consecutive block at the start. */
function dropMisplacedSystemMessages(prompt: Prompt): Prompt {
    let seenNonSystem = false;
    return prompt.filter((m) => {
        if (m.role === "system") return !seenNonSystem;
        seenNonSystem = true;
        return true;
    });
}

/** Strip zero-length text/reasoning parts left over from partial trimming. */
function dropEmptyTextParts(prompt: Prompt): Prompt {
    return prompt.map((m) => {
        if (typeof m.content === "string") return m;
        const parts: readonly Part[] = m.content;
        const filtered = parts.filter(
            (p) => !isTextLike(p) || p.text.length > 0,
        );
        return filtered.length === parts.length
            ? m
            : ({ ...m, content: filtered } as Message);
    });
}

/**
 * Keep only the last occurrence of each toolCallId within a message (for
 * tool-call and tool-result parts).
 */
function filterOutDuplicateToolCalls(prompt: Prompt): Prompt {
    return prompt.map((message) => {
        if (message.role !== "assistant" && message.role !== "tool") {
            return message;
        }
        const parts: readonly Part[] = message.content;
        const lastIndexById = new Map<string, number>();
        parts.forEach((part, index) => {
            if (part.type === "tool-call" || part.type === "tool-result") {
                lastIndexById.set(part.toolCallId, index);
            }
        });
        const filtered = parts.filter((part, index) => {
            if (part.type !== "tool-call" && part.type !== "tool-result") {
                return true;
            }
            return lastIndexById.get(part.toolCallId) === index;
        });
        return filtered.length === parts.length
            ? message
            : ({ ...message, content: filtered } as Message);
    });
}

/**
 * Drops tool-result parts whose originating tool-call no longer appears
 * earlier in the prompt (its assistant message was truncated away). This is
 * the common breakage when truncating from the front. Non-tool-result parts
 * of tool messages (e.g. tool-approval-response) are preserved.
 */
function dropOrphanToolResults(prompt: Prompt): Prompt {
    const seenCallIds = new Set<string>();
    const result: Message[] = [];

    for (const message of prompt) {
        if (message.role === "assistant") {
            for (const part of message.content) {
                if (part.type === "tool-call") {
                    seenCallIds.add(part.toolCallId);
                }
            }
            result.push(message);
            continue;
        }
        if (message.role === "tool") {
            const filtered = message.content.filter(
                (p) =>
                    p.type !== "tool-result" || seenCallIds.has(p.toolCallId),
            );
            if (filtered.length > 0) {
                result.push(
                    filtered.length === message.content.length
                        ? message
                        : { ...message, content: filtered },
                );
            }
            continue;
        }
        result.push(message);
    }
    return result;
}

/**
 * For every tool-call without a matching tool-result (the result was
 * truncated away), inject a synthetic cancelled tool-result immediately after
 * the assistant message that issued it — prepended to an adjacent tool
 * message if one exists. Provider-executed tool-results living inside
 * assistant messages are also counted as resolutions.
 */
function resolveIncompleteToolInvocations(prompt: Prompt): Prompt {
    const resolvedIds = new Set<string>();
    for (const msg of prompt) {
        if (typeof msg.content === "string") continue;
        for (const part of msg.content as readonly Part[]) {
            if (isToolResult(part)) resolvedIds.add(part.toolCallId);
        }
    }

    const result: Message[] = [];
    for (let i = 0; i < prompt.length; i++) {
        // biome-ignore lint/style/noNonNullAssertion: index checked by loop bound
        const msg = prompt[i]!;
        if (msg.role !== "assistant") {
            result.push(msg);
            continue;
        }

        const unanswered: ToolResultPart[] = [];
        for (const part of msg.content) {
            if (part.type !== "tool-call") continue;
            if (resolvedIds.has(part.toolCallId)) continue;
            unanswered.push({
                type: "tool-result",
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                output: {
                    type: "error-text",
                    value: "Tool execution cancelled",
                },
            });
            resolvedIds.add(part.toolCallId);
        }

        result.push(msg);
        if (unanswered.length === 0) continue;

        const next = prompt[i + 1];
        if (next?.role === "tool") {
            result.push({
                ...next,
                content: [...unanswered, ...next.content],
            });
            i++;
        } else {
            result.push({ role: "tool", content: unanswered });
        }
    }
    return result;
}

function isEmptyToolOutput(output: ToolResultOutput): boolean {
    switch (output.type) {
        case "text":
        case "error-text":
            return !output.value || output.value.trim() === "";
        case "json":
        case "error-json":
            return output.value === null || output.value === undefined;
        case "content":
            return !output.value || output.value.length === 0;
        default:
            // execution-denied and future variants carry their own meaning.
            return false;
    }
}

/** Providers reject empty tool_result blocks — give them placeholder content. */
function ensureToolResultsHaveContent(prompt: Prompt): Prompt {
    return prompt.map((message) => {
        if (message.role !== "tool") return message;
        let changed = false;
        const content = message.content.map((part): ToolMessagePart => {
            if (
                part.type !== "tool-result" ||
                !isEmptyToolOutput(part.output)
            ) {
                return part;
            }
            changed = true;
            const isError =
                part.output.type === "error-text" ||
                part.output.type === "error-json";
            return {
                ...part,
                output: isError
                    ? { type: "error-text", value: "Tool execution failed" }
                    : {
                          type: "text",
                          value: `Tool "${part.toolName}" completed with no output.`,
                      },
            };
        });
        return changed ? { ...message, content } : message;
    });
}

/** Drop messages with no usable content. */
function dropEmptyMessages(prompt: Prompt): Prompt {
    return prompt.filter((m) => {
        if (typeof m.content === "string") return m.content.length > 0;
        const parts: readonly Part[] = m.content;
        if (parts.length === 0) return false;
        return parts.some((p) => !isTextLike(p) || p.text.length > 0);
    });
}

export function sanitizePrompt(prompt: Prompt): Prompt {
    return dropEmptyMessages(
        ensureToolResultsHaveContent(
            resolveIncompleteToolInvocations(
                dropOrphanToolResults(
                    filterOutDuplicateToolCalls(
                        dropEmptyTextParts(dropMisplacedSystemMessages(prompt)),
                    ),
                ),
            ),
        ),
    );
}

// -----------------------------------------------------------------------------
// Context-overflow error detection (reactive path)
// -----------------------------------------------------------------------------

const OVERFLOW_PATTERNS: RegExp[] = [
    /context[_ ]length[_ ]exceeded/i, //           OpenAI code
    /maximum context length/i, //                  OpenAI message
    /prompt is too long/i, //                      Anthropic
    /input length and `?max_tokens`? exceed/i, //  Anthropic
    /input is too long/i, //                       Amazon Bedrock (Anthropic models)
    /too many (?:total )?(?:input )?tokens/i, //   Bedrock / Cohere / misc
    /exceeds the (?:maximum|available) (?:number of )?tokens/i, // Google
    /input token count .* exceeds/i, //            Google Gemini
    /reduce the length of the messages/i, //       OpenAI suggestion text
    /token limit exceeded/i, //                    generic
    /request too large/i, //                       OpenAI TPM edge / generic 413
];

/**
 * Heuristically detects provider "prompt/context too long" errors from
 * `APICallError`s. Checks the message, the response body, and structured
 * error codes where providers expose them.
 */
export function isContextOverflowError(error: unknown): boolean {
    if (!APICallError.isInstance(error)) {
        // Some providers wrap the APICallError; check one level of `cause`.
        return (
            error instanceof Error &&
            error.cause !== undefined &&
            error.cause !== error &&
            isContextOverflowError(error.cause)
        );
    }

    const haystacks: string[] = [error.message];
    if (typeof error.responseBody === "string") {
        haystacks.push(error.responseBody);

        // Structured code check (OpenAI-compatible providers).
        try {
            const body = JSON.parse(error.responseBody) as {
                error?: { code?: unknown; type?: unknown };
            };
            const code = body.error?.code ?? body.error?.type;
            if (code === "context_length_exceeded") return true;
        } catch {
            /* not JSON — fall through to pattern matching */
        }
    }
    if (error.data !== undefined) {
        haystacks.push(safeStringify(error.data));
    }

    return haystacks.some((h) => OVERFLOW_PATTERNS.some((re) => re.test(h)));
}

// -----------------------------------------------------------------------------
// The middleware
// -----------------------------------------------------------------------------

export function createTokenLimitMiddleware(
    options: TokenLimitMiddlewareOptions,
): LanguageModelMiddleware {
    const {
        maxInputTokens,
        shouldTruncateMessage,
        shouldTruncateMessagePart,
        maxRetries = 3,
        reductionFactor = 0.85,
        fileTokenEstimate = 768,
        perMessageOverhead = 4,
        onTruncate,
    } = options;

    if (!Number.isFinite(maxInputTokens) || maxInputTokens <= 0) {
        throw new Error("maxInputTokens must be a positive number");
    }
    if (reductionFactor <= 0 || reductionFactor >= 1) {
        throw new Error("reductionFactor must be in (0, 1)");
    }

    const ctx: TruncateContext = {
        fileTokenEstimate,
        perMessageOverhead,
        shouldTruncateMessage,
        shouldTruncateMessagePart,
    };

    const truncateAndSanitize = (
        prompt: Prompt,
        budget: number,
        phase: "proactive" | "reactive",
    ): Prompt => {
        const before = estimatePromptTokens(
            prompt,
            fileTokenEstimate,
            perMessageOverhead,
        );
        const truncated =
            phase === "proactive" && before <= budget
                ? prompt
                : truncatePrompt(prompt, budget, ctx);
        const sanitized = sanitizePrompt(truncated);
        const after = estimatePromptTokens(
            sanitized,
            fileTokenEstimate,
            perMessageOverhead,
        );
        if (after < before) {
            onTruncate?.({
                phase,
                budget,
                estimatedTokensBefore: before,
                estimatedTokensAfter: after,
            });
        }
        return sanitized;
    };

    /**
     * Runs the call with the (already proactively truncated) params. On a
     * context-overflow error, shrinks the budget and retries against the
     * incoming prompt.
     */
    const withReactiveRetries = async <T>(
        params: CallOptions,
        model: MiddlewareModel,
        first: () => PromiseLike<T>,
        retryCall: (m: MiddlewareModel, p: CallOptions) => PromiseLike<T>,
    ): Promise<T> => {
        const basePrompt = params.prompt;
        let lastPrompt = params.prompt;

        let attempt = first;
        for (let retry = 0; ; retry++) {
            try {
                return await attempt();
            } catch (error) {
                if (retry >= maxRetries || !isContextOverflowError(error)) {
                    throw error;
                }
                // The provider just rejected `lastPrompt` as too long, so the
                // new budget must shrink from what was *actually sent* — not
                // from maxInputTokens, which the sent prompt may already sit
                // well below (e.g. when a non-splittable boundary part
                // forfeited unused budget).
                const lastEstimate = estimatePromptTokens(
                    lastPrompt,
                    fileTokenEstimate,
                    perMessageOverhead,
                );
                const budget = Math.max(
                    1,
                    Math.floor(lastEstimate * reductionFactor),
                );
                const nextPrompt = truncateAndSanitize(
                    basePrompt,
                    budget,
                    "reactive",
                );
                // If the prompt cannot shrink any further (e.g. everything
                // remaining is exempt), retrying would resend the identical
                // failing request — give up instead.
                if (JSON.stringify(nextPrompt) === JSON.stringify(lastPrompt)) {
                    throw error;
                }
                lastPrompt = nextPrompt;
                const retryParams: CallOptions = {
                    ...params,
                    prompt: nextPrompt,
                };
                attempt = () => retryCall(model, retryParams);
            }
        }
    };

    return {
        // Proactive truncation, before the first request.
        transformParams: async ({ params }) => ({
            ...params,
            prompt: truncateAndSanitize(
                params.prompt,
                maxInputTokens,
                "proactive",
            ),
        }),

        wrapGenerate: ({ doGenerate, params, model }) =>
            withReactiveRetries(params, model, doGenerate, (m, p) =>
                m.doGenerate(p),
            ),

        // Context-overflow errors surface when the stream request is
        // initiated (the provider rejects before emitting chunks), so
        // retrying the doStream call itself is sufficient.
        wrapStream: ({ doStream, params, model }) =>
            withReactiveRetries(params, model, doStream, (m, p) =>
                m.doStream(p),
            ),
    };
}

export function sanitizeSchemaForAI(
    schema: JSONSchema7Definition,
): JSONSchema7Definition {
    if (typeof schema === "boolean") {
        return schema;
    }

    const result: JSONSchema7 = { ...schema };

    const rawType = result.type;
    const types: JSONSchema7TypeName[] = Array.isArray(rawType)
        ? rawType
        : rawType
          ? [rawType]
          : [];

    // 1. Array Sanitization
    if (types.includes("array")) {
        result.items = result.items
            ? Array.isArray(result.items)
                ? result.items.map(sanitizeSchemaForAI)
                : sanitizeSchemaForAI(result.items)
            : result.items;

        result.additionalItems = result.additionalItems
            ? sanitizeSchemaForAI(result.additionalItems)
            : result.additionalItems;

        result.minItems =
            result.minItems === 0 ? 0 : result.minItems === 1 ? 1 : undefined;
        result.maxItems = undefined;
    }

    // 2. Object Sanitization
    if (types.includes("object")) {
        result.properties = result.properties
            ? Object.fromEntries(
                  Object.entries(result.properties).map(([k, v]) => [
                      k,
                      sanitizeSchemaForAI(v),
                  ]),
              )
            : result.properties;

        if (result.patternProperties) {
            result.patternProperties = Object.fromEntries(
                Object.entries(result.patternProperties).map(([k, v]) => [
                    k,
                    sanitizeSchemaForAI(v),
                ]),
            );
        }

        result.additionalProperties =
            result.additionalProperties === false ? false : undefined;
    }

    // 3. Numeric Sanitization
    if (types.includes("integer") || types.includes("number")) {
        result.multipleOf = undefined;
        result.minimum = undefined;
        result.exclusiveMinimum = undefined;
        result.maximum = undefined;
        result.exclusiveMaximum = undefined;
    }

    // 4. String Sanitization
    if (types.includes("string")) {
        result.minLength = undefined;
        result.maxLength = undefined;
    }

    // 5. Recursive Combinators & Definitions (Handles cases with or without explicit type)
    if (result.anyOf) {
        result.anyOf = result.anyOf.map(sanitizeSchemaForAI);
    }
    if (result.oneOf) {
        result.oneOf = result.oneOf.map(sanitizeSchemaForAI);
    }
    if (result.allOf) {
        result.allOf = result.allOf.map(sanitizeSchemaForAI);
    }
    if (result.definitions) {
        result.definitions = Object.fromEntries(
            Object.entries(result.definitions).map(([k, v]) => [
                k,
                sanitizeSchemaForAI(v),
            ]),
        );
    }
    if (result.$defs) {
        result.$defs = Object.fromEntries(
            Object.entries(result.$defs).map(([k, v]) => [
                k,
                sanitizeSchemaForAI(v),
            ]),
        );
    }

    return result;
}

export function createSchemaSanitizationMiddleware(): LanguageModelMiddleware {
    return {
        transformParams: async ({ params }) => {
            const tools = params.tools?.map((tool) =>
                tool.type !== "provider"
                    ? {
                          ...tool,
                          inputSchema: sanitizeSchemaForAI(
                              tool.inputSchema,
                          ) as JSONSchema7,
                      }
                    : tool,
            );
            const responseFormat =
                params.responseFormat?.type === "json"
                    ? {
                          ...params.responseFormat,
                          schema: params.responseFormat.schema
                              ? (sanitizeSchemaForAI(
                                    params.responseFormat.schema,
                                ) as JSONSchema7)
                              : params.responseFormat.schema,
                      }
                    : params.responseFormat;
            return { ...params, tools, responseFormat };
        },
    };
}

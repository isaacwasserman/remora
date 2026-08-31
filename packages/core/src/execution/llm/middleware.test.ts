import { describe, expect, test } from "bun:test";
import { APICallError } from "ai";
import {
    createTokenLimitMiddleware,
    isContextOverflowError,
    sanitizePrompt,
    sanitizeSchemaForAI,
} from "./middleware";

// =============================================================================
// sanitizeSchemaForAI
// =============================================================================

describe("sanitizeSchemaForAI", () => {
    test("strips minItems > 1 and maxItems from arrays", () => {
        const result = sanitizeSchemaForAI({
            type: "array",
            items: { type: "string" },
            minItems: 5,
            maxItems: 10,
        }) as Record<string, unknown>;
        expect(result.minItems).toBeUndefined();
        expect(result.maxItems).toBeUndefined();
    });

    test("preserves minItems 0 and 1", () => {
        const zero = sanitizeSchemaForAI({
            type: "array",
            items: { type: "string" },
            minItems: 0,
        });
        const one = sanitizeSchemaForAI({
            type: "array",
            items: { type: "string" },
            minItems: 1,
        });
        expect((zero as Record<string, unknown>).minItems).toBe(0);
        expect((one as Record<string, unknown>).minItems).toBe(1);
    });

    test("strips numeric constraints", () => {
        const result = sanitizeSchemaForAI({
            type: "integer",
            minimum: 0,
            maximum: 150,
            multipleOf: 1,
            exclusiveMinimum: 0,
            exclusiveMaximum: 200,
        }) as Record<string, unknown>;
        expect(result.minimum).toBeUndefined();
        expect(result.maximum).toBeUndefined();
        expect(result.multipleOf).toBeUndefined();
        expect(result.exclusiveMinimum).toBeUndefined();
        expect(result.exclusiveMaximum).toBeUndefined();
    });

    test("strips string length constraints but preserves format", () => {
        const result = sanitizeSchemaForAI({
            type: "string",
            format: "email",
            minLength: 1,
            maxLength: 255,
        }) as Record<string, unknown>;
        expect(result.format).toBe("email");
        expect(result.minLength).toBeUndefined();
        expect(result.maxLength).toBeUndefined();
    });

    test("preserves $ref, $defs, default, anyOf", () => {
        const result = sanitizeSchemaForAI({
            type: "object",
            $defs: { Name: { type: "string" } },
            properties: {
                name: { $ref: "#/$defs/Name", default: "unknown" },
                status: { anyOf: [{ const: "a" }, { const: "b" }] },
            },
        }) as Record<string, unknown>;
        expect(result.$defs).toBeDefined();
        expect(
            (result.properties as Record<string, Record<string, unknown>>)?.name
                ?.$ref,
        ).toBe("#/$defs/Name");
    });

    test("leaves a simple object unchanged", () => {
        const schema = {
            type: "object" as const,
            properties: { name: { type: "string" as const } },
            required: ["name"],
            additionalProperties: false,
        };
        expect(sanitizeSchemaForAI(schema)).toEqual(schema);
    });

    test("recurses into nested objects and arrays", () => {
        const result = sanitizeSchemaForAI({
            type: "object",
            properties: {
                items: {
                    type: "array",
                    items: { type: "integer", minimum: 0 },
                    minItems: 5,
                },
            },
        }) as Record<string, unknown>;
        const items = (
            result.properties as Record<string, Record<string, unknown>>
        )?.items;
        expect(items?.minItems).toBeUndefined();
        expect(
            (items?.items as Record<string, unknown>)?.minimum,
        ).toBeUndefined();
    });
});

// =============================================================================
// sanitizePrompt
// =============================================================================

describe("sanitizePrompt", () => {
    test("drops orphan tool-results whose tool-call was removed", () => {
        const result = sanitizePrompt([
            {
                role: "tool",
                content: [
                    {
                        type: "tool-result",
                        toolCallId: "gone",
                        toolName: "t",
                        output: { type: "text", value: "x" },
                    },
                ],
            },
        ]);
        expect(result).toEqual([]);
    });

    test("injects cancelled result for tool-call without a tool-result", () => {
        const result = sanitizePrompt([
            {
                role: "assistant",
                content: [
                    {
                        type: "tool-call",
                        toolCallId: "c1",
                        toolName: "t",
                        input: {},
                    },
                ],
            },
        ]);
        expect(result).toHaveLength(2);
        const toolMsg = result[1];
        expect(toolMsg?.role).toBe("tool");
        const part = (toolMsg as { content: unknown[] }).content[0] as Record<
            string,
            unknown
        >;
        expect(part.type).toBe("tool-result");
        expect(part.toolCallId).toBe("c1");
    });

    test("drops system messages after a non-system message", () => {
        const result = sanitizePrompt([
            { role: "user", content: [{ type: "text", text: "hi" }] },
            { role: "system", content: "late system" },
        ]);
        expect(result.every((m) => m.role !== "system")).toBe(true);
    });

    test("fills empty tool-result with placeholder", () => {
        const result = sanitizePrompt([
            {
                role: "assistant",
                content: [
                    {
                        type: "tool-call",
                        toolCallId: "c1",
                        toolName: "t",
                        input: {},
                    },
                ],
            },
            {
                role: "tool",
                content: [
                    {
                        type: "tool-result",
                        toolCallId: "c1",
                        toolName: "t",
                        output: { type: "text", value: "" },
                    },
                ],
            },
        ]);
        const toolPart = (result[1] as { content: unknown[] })
            .content[0] as Record<string, Record<string, unknown>>;
        expect(toolPart.output?.value).toContain("completed with no output");
    });
});

// =============================================================================
// isContextOverflowError
// =============================================================================

describe("isContextOverflowError", () => {
    function makeAPICallError(message: string, body?: string): APICallError {
        return new APICallError({
            message,
            url: "https://api.example.com",
            requestBodyValues: {},
            statusCode: 400,
            responseBody: body,
        });
    }

    test("detects OpenAI context_length_exceeded code in body", () => {
        expect(
            isContextOverflowError(
                makeAPICallError(
                    "error",
                    JSON.stringify({
                        error: { code: "context_length_exceeded" },
                    }),
                ),
            ),
        ).toBe(true);
    });

    test("detects pattern in message", () => {
        expect(
            isContextOverflowError(
                makeAPICallError("This prompt is too long for the model"),
            ),
        ).toBe(true);
    });

    test("rejects unrelated errors", () => {
        expect(
            isContextOverflowError(makeAPICallError("rate limit exceeded")),
        ).toBe(false);
    });

    test("detects overflow in a wrapped cause", () => {
        const inner = makeAPICallError("maximum context length exceeded");
        const outer = new Error("wrapper");
        outer.cause = inner;
        expect(isContextOverflowError(outer)).toBe(true);
    });

    test("rejects non-Error values", () => {
        expect(isContextOverflowError("string error")).toBe(false);
        expect(isContextOverflowError(null)).toBe(false);
    });
});

// =============================================================================
// createTokenLimitMiddleware
// =============================================================================

describe("createTokenLimitMiddleware", () => {
    test("rejects invalid maxInputTokens", () => {
        expect(() =>
            createTokenLimitMiddleware({ maxInputTokens: 0 }),
        ).toThrow();
        expect(() =>
            createTokenLimitMiddleware({ maxInputTokens: -1 }),
        ).toThrow();
    });

    test("rejects invalid reductionFactor", () => {
        expect(() =>
            createTokenLimitMiddleware({
                maxInputTokens: 100,
                reductionFactor: 0,
            }),
        ).toThrow();
        expect(() =>
            createTokenLimitMiddleware({
                maxInputTokens: 100,
                reductionFactor: 1,
            }),
        ).toThrow();
    });

    test("proactive truncation removes earlier messages first", async () => {
        const mw = createTokenLimitMiddleware({ maxInputTokens: 20 });
        const longText = Array(200).fill("word").join(" ");
        const prompt = [
            {
                role: "user" as const,
                content: [{ type: "text" as const, text: longText }],
            },
            {
                role: "assistant" as const,
                content: [{ type: "text" as const, text: "short" }],
            },
        ];
        const result = await mw.transformParams?.({
            type: "generate" as const,
            params: { prompt } as never,
            model: {} as never,
        });
        const output = (result as { prompt: unknown[] }).prompt;
        expect(output.length).toBeLessThanOrEqual(2);
        const last = output[output.length - 1] as {
            content: { text: string }[];
        };
        expect(last?.content[0]?.text).toBe("short");
    });
});

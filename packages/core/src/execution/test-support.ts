import { MockLanguageModelV4 } from "ai/test";
import { remoraflowSettingsSchema } from "../types";
import type { DurationPolicy } from "./execution-engine/duration-policy";
import type { RetryPolicy } from "./execution-engine/retry-policy";
import type {
    InterventionResponse,
    RequestInterventionInput,
    UserInterventionAdapter,
} from "./user-intervention/types";

/**
 * Policies that stay out of the way, for tests about something else.
 * `minPollIntervalSeconds` is zeroed so tests that poll don't stall.
 */
export function testPolicies(overrides: Record<string, number> = {}): {
    duration: DurationPolicy;
    retry: RetryPolicy;
} {
    const options = remoraflowSettingsSchema.assert({
        duration: { minPollIntervalSeconds: 0, ...overrides },
    });
    return { duration: options.duration, retry: options.stepRetry };
}

/** @deprecated Use {@link testPolicies} — returns only the duration policy. */
export function testDurationPolicy(
    overrides: Record<string, number> = {},
): DurationPolicy {
    return testPolicies(overrides).duration;
}

type GenerateResult = Awaited<ReturnType<MockLanguageModelV4["doGenerate"]>>;

const usage: GenerateResult["usage"] = {
    inputTokens: {
        total: 10,
        noCache: 10,
        cacheRead: undefined,
        cacheWrite: undefined,
    },
    outputTokens: { total: 10, text: 10, reasoning: undefined },
};

function textResult(text: string): GenerateResult {
    return {
        content: [{ type: "text" as const, text }],
        finishReason: { unified: "stop" as const, raw: undefined },
        usage,
        warnings: [],
    };
}

export type MockToolCall = {
    toolCallId: string;
    toolName: string;
    input: unknown;
};

export type MockModelTurn =
    | { type: "object"; value: unknown }
    | { type: "text"; text: string }
    | { type: "tool-calls"; calls: MockToolCall[] }
    | { type: "error"; error: Error | string };

function resultForTurn(turn: Exclude<MockModelTurn, { type: "error" }>) {
    switch (turn.type) {
        case "object":
            return textResult(JSON.stringify(turn.value));
        case "text":
            return textResult(turn.text);
        case "tool-calls":
            return {
                content: turn.calls.map((call) => ({
                    type: "tool-call" as const,
                    toolCallId: call.toolCallId,
                    toolName: call.toolName,
                    input: JSON.stringify(call.input),
                })),
                finishReason: {
                    unified: "tool-calls" as const,
                    raw: undefined,
                },
                usage,
                warnings: [],
            } satisfies GenerateResult;
    }
}

/**
 * Build a V4 mock model from provider-level turns. The helper throws on an
 * unexpected extra call so a workflow cannot silently consume the wrong script.
 */
export function createScriptedMockModel(
    turns: MockModelTurn[],
): MockLanguageModelV4 {
    let callIndex = 0;
    return new MockLanguageModelV4({
        doGenerate: async () => {
            const turn = turns[callIndex++];
            if (!turn) {
                throw new Error(
                    `Mock model received call ${callIndex} but was given only ${turns.length} turn(s).`,
                );
            }
            if (turn.type === "error") {
                throw typeof turn.error === "string"
                    ? new Error(turn.error)
                    : turn.error;
            }
            return resultForTurn(turn);
        },
    });
}

/**
 * Build a mock model that returns the given structured responses in order —
 * one per LLM call in the workflow. Each response object must satisfy the
 * corresponding step's `outputFormat` schema.
 */
export function createMockModel(responses: unknown[]): MockLanguageModelV4 {
    return createScriptedMockModel(
        responses.map((value) => ({ type: "object", value })),
    );
}

/** A mock model whose single generation returns `object` as JSON text. */
export function modelReturning(object: unknown): MockLanguageModelV4 {
    return createMockModel([object]);
}

/** A mock model whose generation call rejects with `message`. */
export function failingModel(message: string): MockLanguageModelV4 {
    return createScriptedMockModel([{ type: "error", error: message }]);
}

export type MockInterventionPlan = {
    answer?: string;
    pendingReads?: number;
    requestError?: Error | string;
    responseError?: Error | string;
};

/** A scripted adapter with observable requests and response polling. */
export function createMockUserInterventionAdapter(
    plans: MockInterventionPlan[],
): {
    adapter: UserInterventionAdapter;
    requests: RequestInterventionInput[];
    reads: string[];
    events: string[];
} {
    const requests: RequestInterventionInput[] = [];
    const reads: string[] = [];
    const events: string[] = [];
    const planById = new Map<
        string,
        MockInterventionPlan & { remainingPendingReads: number }
    >();

    const adapter: UserInterventionAdapter = {
        requestIntervention: async (input) => {
            const plan = plans[requests.length];
            if (!plan) {
                throw new Error(
                    `Mock intervention adapter received request ${requests.length + 1} but was given only ${plans.length} plan(s).`,
                );
            }
            requests.push(input);
            events.push(`request:${input.interventionRequestId}`);
            if (plan.requestError) {
                throw typeof plan.requestError === "string"
                    ? new Error(plan.requestError)
                    : plan.requestError;
            }
            planById.set(input.interventionRequestId, {
                ...plan,
                remainingPendingReads: plan.pendingReads ?? 0,
            });
        },
        getResponse: async (interventionRequestId) => {
            reads.push(interventionRequestId);
            events.push(`read:${interventionRequestId}`);
            const plan = planById.get(interventionRequestId);
            if (!plan) {
                throw new Error(
                    `No mock intervention plan was registered for ${interventionRequestId}.`,
                );
            }
            if (plan.responseError) {
                throw typeof plan.responseError === "string"
                    ? new Error(plan.responseError)
                    : plan.responseError;
            }
            if (plan.remainingPendingReads > 0) {
                plan.remainingPendingReads--;
                return undefined as unknown as InterventionResponse;
            }
            if (plan.answer === undefined) {
                throw new Error(
                    `Mock intervention plan for ${interventionRequestId} has no answer.`,
                );
            }
            return { answer: plan.answer };
        },
    };

    return { adapter, requests, reads, events };
}

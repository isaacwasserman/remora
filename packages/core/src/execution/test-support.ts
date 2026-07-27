import { MockLanguageModelV3 } from "ai/test";

function textResult(text: string) {
    return {
        content: [{ type: "text" as const, text }],
        finishReason: { unified: "stop" as const, raw: undefined },
        usage: {
            inputTokens: {
                total: 10,
                noCache: undefined,
                cacheRead: undefined,
                cacheWrite: undefined,
            },
            outputTokens: { total: 10, text: undefined, reasoning: undefined },
        },
        warnings: [],
    };
}

/**
 * Build a mock model that returns the given structured responses in order —
 * one per LLM call in the workflow. Each response object must satisfy the
 * corresponding step's `outputFormat` schema.
 */
export function createMockModel(responses: unknown[]): MockLanguageModelV3 {
    let callIndex = 0;
    return new MockLanguageModelV3({
        doGenerate: async () => {
            if (callIndex >= responses.length) {
                throw new Error(
                    `Mock model received call ${callIndex + 1} but was given only ${responses.length} response(s).`,
                );
            }
            return textResult(JSON.stringify(responses[callIndex++]));
        },
    });
}

/** A mock model whose single generation returns `object` as JSON text. */
export function modelReturning(object: unknown): MockLanguageModelV3 {
    return createMockModel([object]);
}

/** A mock model whose generation call rejects with `message`. */
export function failingModel(message: string): MockLanguageModelV3 {
    return new MockLanguageModelV3({
        doGenerate: async () => {
            throw new Error(message);
        },
    });
}

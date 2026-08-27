import { expect, test } from "bun:test";
import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import {
    generateWorkflowStream,
    type WorkflowGenerationDiagnosticEvent,
} from "./index";

const usage = {
    inputTokens: {
        total: 10,
        noCache: 10,
        cacheRead: undefined,
        cacheWrite: undefined,
    },
    outputTokens: { total: 10, text: 10, reasoning: undefined },
};

function createRepairingThenHangingModel() {
    let callCount = 0;
    let secondCallStarted: (() => void) | undefined;
    let aborted: (() => void) | undefined;
    const secondCallStart = new Promise<void>((resolve) => {
        secondCallStarted = resolve;
    });
    const abortObserved = new Promise<void>((resolve) => {
        aborted = resolve;
    });

    return {
        abortObserved,
        getCallCount: () => callCount,
        model: new MockLanguageModelV4({
            doGenerate: async ({ abortSignal }) => {
                callCount++;
                if (callCount === 1) {
                    return {
                        content: [
                            {
                                type: "tool-call" as const,
                                toolCallId: "invalid-submission",
                                toolName: "submit-workflow",
                                input: JSON.stringify({
                                    definition: {
                                        initialStepId: "start",
                                        steps: [
                                            {
                                                id: "start",
                                                name: "Start",
                                                description: "",
                                                type: "start",
                                                nextStepId: "missing",
                                            },
                                        ],
                                    },
                                }),
                            },
                        ],
                        finishReason: {
                            unified: "tool-calls" as const,
                            raw: undefined,
                        },
                        usage,
                        warnings: [],
                    };
                }

                secondCallStarted?.();
                return await new Promise<never>((_resolve, reject) => {
                    const rejectForAbort = () => {
                        aborted?.();
                        reject(new DOMException("Aborted", "AbortError"));
                    };
                    if (abortSignal?.aborted) {
                        rejectForAbort();
                    } else {
                        abortSignal?.addEventListener("abort", rejectForAbort, {
                            once: true,
                        });
                    }
                });
            },
        }),
        secondCallStart,
    };
}

test("aborts model generation when its consumer closes the stream", async () => {
    const callerAbortController = new AbortController();
    const { abortObserved, getCallCount, model, secondCallStart } =
        createRepairingThenHangingModel();

    const stream = generateWorkflowStream({
        abortSignal: callerAbortController.signal,
        taskDescription: "Create an intentionally invalid workflow.",
        tools: {},
        options: {},
        model,
        maxGenerationSteps: 20,
    });

    const intermediate = await stream.next();
    expect(intermediate.done).toBe(false);
    await secondCallStart;

    await stream.return(undefined as never);
    await abortObserved;
    expect(callerAbortController.signal.aborted).toBe(false);
    expect(getCallCount()).toBe(2);
});

test("aborts model generation when its caller aborts", async () => {
    const callerAbortController = new AbortController();
    const { abortObserved, getCallCount, model, secondCallStart } =
        createRepairingThenHangingModel();
    const stream = generateWorkflowStream({
        abortSignal: callerAbortController.signal,
        taskDescription: "Create an intentionally invalid workflow.",
        tools: {},
        options: {},
        model,
        maxGenerationSteps: 20,
    });

    const intermediate = await stream.next();
    expect(intermediate.done).toBe(false);
    await secondCallStart;

    callerAbortController.abort();
    await abortObserved;
    await expect(stream.next()).rejects.toThrow();
    expect(getCallCount()).toBe(2);
});

test("reports provider retries and invalid tool calls", async () => {
    let callCount = 0;
    const events: WorkflowGenerationDiagnosticEvent[] = [];
    const model = new MockLanguageModelV4({
        doGenerate: async () => {
            callCount++;
            if (callCount === 1) {
                throw new APICallError({
                    message: "Temporarily unavailable",
                    url: "https://provider.example.test/generate",
                    requestBodyValues: {},
                    statusCode: 503,
                    responseHeaders: { "retry-after-ms": "0" },
                    responseBody: '{"error":"overloaded"}',
                    isRetryable: true,
                });
            }

            return {
                content: [
                    {
                        type: "tool-call" as const,
                        toolCallId: "malformed-submission",
                        toolName: "submit-workflow",
                        input: "{}",
                    },
                ],
                finishReason: {
                    unified: "tool-calls" as const,
                    raw: "tool_calls",
                },
                usage,
                warnings: [],
                providerMetadata: { test: { requestId: "request-2" } },
                response: {
                    id: "response-2",
                    modelId: "mock-model",
                    headers: {
                        "x-request-id": "request-2",
                        "set-cookie": "secret-cookie",
                        authorization: "secret-authorization",
                    },
                },
            };
        },
    });
    const stream = generateWorkflowStream({
        taskDescription: "Submit a malformed workflow.",
        tools: {},
        options: {},
        model,
        maxGenerationSteps: 1,
        onDiagnosticEvent: (event) => events.push(event),
    });

    await expect(stream.next()).rejects.toThrow(
        "Generation ended before a valid workflow could be authored.",
    );

    expect(callCount).toBe(2);
    expect(events.map((event) => event.type)).toEqual([
        "generation-start",
        "step-start",
        "provider-attempt-start",
        "provider-attempt-error",
        "provider-attempt-start",
        "provider-attempt-end",
        "step-end",
        "generation-error",
    ]);

    const retryError = events.find(
        (event) => event.type === "provider-attempt-error",
    );
    expect(retryError).toMatchObject({
        stepNumber: 0,
        attempt: 1,
        error: {
            statusCode: 503,
            isRetryable: true,
            url: "https://provider.example.test/generate",
            responseHeaders: { "retry-after-ms": "0" },
            responseBody: '{"error":"overloaded"}',
        },
    });

    const successfulRetry = events.find(
        (event) => event.type === "provider-attempt-end",
    );
    expect(successfulRetry).toMatchObject({
        stepNumber: 0,
        attempt: 2,
        finishReason: { unified: "tool-calls", raw: "tool_calls" },
        providerMetadata: { test: { requestId: "request-2" } },
        response: {
            id: "response-2",
            modelId: "mock-model",
            headers: { "x-request-id": "request-2" },
        },
    });
    if (successfulRetry?.type !== "provider-attempt-end") {
        throw new Error("Expected a successful provider attempt diagnostic.");
    }
    expect(successfulRetry.response.headers).toEqual({
        "x-request-id": "request-2",
    });

    const stepEnd = events.find((event) => event.type === "step-end");
    expect(stepEnd).toMatchObject({
        stepNumber: 0,
        finishReason: "tool-calls",
        rawFinishReason: "tool_calls",
        invalidToolCalls: [
            {
                toolCallId: "malformed-submission",
                toolName: "submit-workflow",
                input: {},
                error: {
                    name: "AI_InvalidToolInputError",
                },
            },
        ],
    });
    if (stepEnd?.type !== "step-end") {
        throw new Error("Expected a completed generation step diagnostic.");
    }
    expect(stepEnd.invalidToolCalls[0]?.error).toEqual({
        name: "AI_InvalidToolInputError",
        message: expect.any(String),
    });
    expect(stepEnd.invalidToolCalls[0]?.error.message).not.toContain("Value:");
});

test("requests strict, closed input generation for workflow submissions", async () => {
    let submittedTools: Parameters<
        MockLanguageModelV4["doGenerate"]
    >[0]["tools"];
    const model = new MockLanguageModelV4({
        doGenerate: async ({ tools }) => {
            submittedTools = tools;
            return {
                content: [
                    {
                        type: "tool-call" as const,
                        toolCallId: "give-up-call",
                        toolName: "give-up",
                        input: JSON.stringify({ reason: "Test complete." }),
                    },
                ],
                finishReason: {
                    unified: "tool-calls" as const,
                    raw: "tool_calls",
                },
                usage,
                warnings: [],
            };
        },
    });
    const stream = generateWorkflowStream({
        taskDescription: "Inspect the available generation tools.",
        tools: {},
        options: {},
        model,
        maxGenerationSteps: 1,
    });

    const result = await stream.next();

    expect(result.done).toBe(true);
    const submitWorkflowTool = submittedTools?.find(
        (tool) => tool.name === "submit-workflow",
    );
    expect(submitWorkflowTool).toMatchObject({
        type: "function",
        strict: true,
        inputSchema: {
            additionalProperties: false,
            properties: {
                definition: { additionalProperties: false },
            },
        },
    });
});

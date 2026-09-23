import { expect, test } from "bun:test";
import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import {
    generateWorkflow,
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
                                toolCallId: "invalid-write",
                                toolName: "write-workflow",
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
                    { type: "reasoning" as const, text: "Write a workflow." },
                    {
                        type: "tool-call" as const,
                        toolCallId: "malformed-write",
                        toolName: "write-workflow",
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
        reasoningText: "Write a workflow.",
        toolCalls: [
            {
                toolCallId: "malformed-write",
                toolName: "write-workflow",
                status: "invalid",
            },
        ],
        invalidToolCalls: [
            {
                toolCallId: "malformed-write",
                toolName: "write-workflow",
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

test("requests closed input generation for workflow writes", async () => {
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
        strictToolCalls: true,
    });

    const result = await stream.next();

    expect(result.done).toBe(true);
    const writeWorkflowTool = submittedTools?.find(
        (tool) => tool.name === "write-workflow",
    );
    expect(writeWorkflowTool).toMatchObject({
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

function createScriptedModel(
    toolCalls: Array<{ toolName: string; input: unknown }>,
) {
    const prompts: unknown[] = [];
    const model = new MockLanguageModelV4({
        doGenerate: async ({ prompt }) => {
            prompts.push(prompt);
            const toolCall = toolCalls[prompts.length - 1];
            if (!toolCall) throw new Error("The script has no more steps.");
            return {
                content: [
                    {
                        type: "tool-call" as const,
                        toolCallId: `call-${prompts.length}`,
                        toolName: toolCall.toolName,
                        input: JSON.stringify(toolCall.input),
                    },
                ],
                finishReason: {
                    unified: "tool-calls" as const,
                    raw: undefined,
                },
                usage,
                warnings: [],
            };
        },
    });
    return { model, prompts };
}

test("writes, edits, and submits a workflow", async () => {
    const start = {
        id: "start",
        name: "Start",
        description: "",
        type: "start",
        nextStepId: "missing",
    };
    const end = { id: "done", name: "Done", description: "", type: "end" };
    const { model, prompts } = createScriptedModel([
        {
            toolName: "write-workflow",
            input: { definition: { initialStepId: "start", steps: [start] } },
        },
        {
            toolName: "edit-workflow",
            input: {
                operations: [
                    { op: "add", path: "/steps/-", value: end },
                    {
                        op: "replace",
                        path: "/steps/0/nextStepId",
                        value: "done",
                    },
                ],
            },
        },
        { toolName: "submit-workflow", input: {} },
    ]);
    const events: WorkflowGenerationDiagnosticEvent[] = [];
    const stream = generateWorkflowStream({
        taskDescription: "Create an empty workflow.",
        tools: {},
        options: {},
        model,
        maxGenerationSteps: 5,
        onDiagnosticEvent: (event) => events.push(event),
    });

    const yielded: unknown[] = [];
    let result = await stream.next();
    while (!result.done) {
        yielded.push(result.value);
        result = await stream.next();
    }

    const fixed = {
        initialStepId: "start",
        steps: [{ ...start, nextStepId: "done" }, end],
    };
    expect(yielded).toEqual([
        { initialStepId: "start", steps: [start] },
        fixed,
        fixed,
    ]);
    expect(result.value).toEqual({
        gaveUp: false,
        reason: null,
        workflowDefinition: fixed as never,
    });
    expect(
        events.flatMap((event) =>
            event.type === "step-end" ? event.toolCalls : [],
        ),
    ).toEqual([
        {
            toolCallId: "call-1",
            toolName: "write-workflow",
            status: "succeeded",
        },
        {
            toolCallId: "call-2",
            toolName: "edit-workflow",
            status: "succeeded",
        },
        {
            toolCallId: "call-3",
            toolName: "submit-workflow",
            status: "succeeded",
        },
    ]);
    expect(JSON.stringify(prompts[1])).toContain("diagnostics");
    expect(JSON.stringify(prompts[1])).not.toContain("error-text");
});

test("rejects a submission before a workflow is written", async () => {
    const { model, prompts } = createScriptedModel([
        { toolName: "submit-workflow", input: {} },
        { toolName: "give-up", input: { reason: "Test complete." } },
    ]);
    const events: WorkflowGenerationDiagnosticEvent[] = [];
    const result = await generateWorkflow({
        taskDescription: "Submit without a workflow.",
        tools: {},
        options: {},
        model,
        maxGenerationSteps: 5,
        onDiagnosticEvent: (event) => events.push(event),
    });

    expect(result.gaveUp).toBe(true);
    expect(events.find((event) => event.type === "step-end")).toMatchObject({
        toolCalls: [{ toolName: "submit-workflow", status: "failed" }],
    });
    expect(JSON.stringify(prompts[1])).toContain("No workflow exists yet");
});

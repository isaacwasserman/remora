import { describe, expect, test } from "bun:test";
import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { type } from "arktype";
import { createScriptedMockModel } from "../execution/test-support";
import { step, workflow } from "../workflow-fixtures";
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

const cleanWorkflow = workflow(
    step("start", { type: "start", nextStepId: "done" }),
    step("done", { type: "end" }),
);
/** Valid, but warns because its first step is not a "start" step. */
const warningWorkflow = workflow(step("done", { type: "end" }));

/** Runs generation with a model that makes one tool call per step. */
async function generateScripted(
    calls: Array<{ toolName: string; input: unknown }>,
    overrides: Partial<Parameters<typeof generateWorkflow>[0]> = {},
) {
    const model = createScriptedMockModel(
        calls.map((call, index) => ({
            type: "tool-calls" as const,
            calls: [{ toolCallId: `call-${index + 1}`, ...call }],
        })),
    );
    const events: WorkflowGenerationDiagnosticEvent[] = [];
    const result = await generateWorkflow({
        taskDescription: "Test.",
        tools: {},
        options: {},
        model,
        maxGenerationSteps: 5,
        onDiagnosticEvent: (event) => events.push(event),
        ...overrides,
    });
    const toolCalls = events.flatMap((event) =>
        event.type === "step-end" ? event.toolCalls : [],
    );
    /** The result of a tool call, as the model received it. */
    const toolOutput = (toolCallId: string) =>
        model.doGenerateCalls
            .flatMap((call) => call.prompt)
            .flatMap((message) =>
                message.role === "tool" ? message.content : [],
            )
            .find(
                (part) =>
                    part.type === "tool-result" &&
                    part.toolCallId === toolCallId,
            );
    return { model, result, toolCalls, toolOutput };
}

test("writes, edits, and submits a workflow", async () => {
    const draft = workflow(
        step("start", { type: "start", nextStepId: "missing" }),
    );
    const operations = [
        { op: "add", path: "/steps/-", value: step("done", { type: "end" }) },
        { op: "replace", path: "/steps/0/nextStepId", value: "done" },
    ];
    const model = createScriptedMockModel([
        {
            type: "tool-calls",
            calls: [
                {
                    toolCallId: "call-1",
                    toolName: "write-workflow",
                    input: { definition: draft },
                },
            ],
        },
        {
            type: "tool-calls",
            calls: [
                {
                    toolCallId: "call-2",
                    toolName: "edit-workflow",
                    input: { operations },
                },
            ],
        },
        {
            type: "tool-calls",
            calls: [
                {
                    toolCallId: "call-3",
                    toolName: "submit-workflow",
                    input: {},
                },
            ],
        },
    ]);
    const stream = generateWorkflowStream({
        taskDescription: "Create an empty workflow.",
        tools: {},
        options: {},
        model,
        maxGenerationSteps: 5,
    });

    const yielded: unknown[] = [];
    let result = await stream.next();
    while (!result.done) {
        yielded.push(result.value);
        result = await stream.next();
    }

    expect(yielded).toEqual([draft, cleanWorkflow, cleanWorkflow]);
    expect(result.value).toEqual({
        gaveUp: false,
        reason: null,
        workflowDefinition: cleanWorkflow,
    });
    const toolResults = model.doGenerateCalls[2]?.prompt.flatMap((message) =>
        message.role === "tool" ? message.content : [],
    );
    expect(toolResults).toMatchObject([
        {
            toolCallId: "call-1",
            output: {
                type: "json",
                value: {
                    diagnostics: [
                        { severity: "error", path: ["steps", 0, "nextStepId"] },
                    ],
                    submitted: false,
                },
            },
        },
        {
            toolCallId: "call-2",
            output: {
                type: "json",
                value: {
                    definition: cleanWorkflow,
                    diagnostics: [],
                    submitted: false,
                },
            },
        },
    ]);
});

test("records the input and status of each tool call", async () => {
    const { toolCalls } = await generateScripted([
        { toolName: "write-workflow", input: { definition: cleanWorkflow } },
        { toolName: "submit-workflow", input: {} },
    ]);

    expect(toolCalls).toEqual([
        {
            toolCallId: "call-1",
            toolName: "write-workflow",
            input: { definition: cleanWorkflow },
            status: "succeeded",
        },
        {
            toolCallId: "call-2",
            toolName: "submit-workflow",
            input: {},
            status: "succeeded",
        },
    ]);
});

test("rejects a submission before a workflow is written", async () => {
    const { result, toolCalls, toolOutput } = await generateScripted([
        { toolName: "submit-workflow", input: {} },
        { toolName: "give-up", input: { reason: "Test complete." } },
    ]);

    expect(result.gaveUp).toBe(true);
    expect(toolCalls[0]).toMatchObject({ status: "failed" });
    expect(toolOutput("call-1")).toMatchObject({
        output: {
            type: "error-text",
            value: "Error: No workflow exists yet. Use write-workflow to write one.",
        },
    });
});

test("submitIfValid ends generation after a clean write", async () => {
    const { model, result } = await generateScripted([
        {
            toolName: "write-workflow",
            input: { definition: cleanWorkflow, submitIfValid: true },
        },
    ]);

    expect(model.doGenerateCalls).toHaveLength(1);
    expect(result.workflowDefinition).toEqual(cleanWorkflow);
});

test("submitIfValid does not submit a workflow that has warnings", async () => {
    const { result, toolOutput } = await generateScripted([
        {
            toolName: "write-workflow",
            input: { definition: warningWorkflow, submitIfValid: true },
        },
        { toolName: "give-up", input: { reason: "Test complete." } },
    ]);

    expect(toolOutput("call-1")).toMatchObject({
        output: { value: { submitted: false } },
    });
    expect(result.gaveUp).toBe(true);
});

test("submit-workflow accepts warnings only with ignoreWarnings", async () => {
    const { result, toolCalls } = await generateScripted([
        { toolName: "write-workflow", input: { definition: warningWorkflow } },
        { toolName: "submit-workflow", input: {} },
        { toolName: "submit-workflow", input: { ignoreWarnings: true } },
    ]);

    expect(toolCalls.map((toolCall) => toolCall.status)).toEqual([
        "succeeded",
        "failed",
        "succeeded",
    ]);
    expect(result.workflowDefinition).toEqual(warningWorkflow);
});

test("reports the error of a failed tool call", async () => {
    const { toolCalls } = await generateScripted([
        { toolName: "write-workflow", input: { definition: cleanWorkflow } },
        {
            toolName: "edit-workflow",
            input: { operations: [{ op: "remove", path: "/steps/3" }] },
        },
        { toolName: "give-up", input: { reason: "Test complete." } },
    ]);

    expect(toolCalls[1]).toMatchObject({
        toolName: "edit-workflow",
        status: "failed",
        input: { operations: [{ op: "remove", path: "/steps/3" }] },
        error: {
            message:
                'Patch operation 0 ({"op":"remove","path":"/steps/3"}) failed with OPERATION_PATH_UNRESOLVABLE.',
        },
    });
});

test("marks the instructions as an Anthropic cache breakpoint", async () => {
    const { model } = await generateScripted(
        [{ toolName: "give-up", input: { reason: "Test complete." } }],
        { maxGenerationSteps: 1 },
    );

    expect(model.doGenerateCalls[0]?.prompt[0]).toMatchObject({
        role: "system",
        providerOptions: {
            anthropic: { cacheControl: { type: "ephemeral" } },
        },
    });
});

test("repairs arguments that were sent as JSON strings", async () => {
    const { model, result } = await generateScripted([
        {
            toolName: "write-workflow",
            input: { definition: JSON.stringify(cleanWorkflow) },
        },
        {
            toolName: "edit-workflow",
            input: {
                operations: JSON.stringify([
                    { op: "replace", path: "/steps/1/name", value: "End" },
                ]),
                submitIfValid: true,
            },
        },
    ]);

    expect(model.doGenerateCalls).toHaveLength(2);
    expect(result.workflowDefinition?.steps[1]?.name).toBe("End");
});

describe("required output schema", () => {
    const routed = (outputSchema?: object) => ({
        ...workflow(
            step("start", { type: "start", nextStepId: "done" }),
            step("done", {
                type: "end",
                params: {
                    output: { type: "literal", value: { route: "review" } },
                },
            }),
        ),
        ...(outputSchema ? { outputSchema } : {}),
    });
    const workflowOutputSchema = type({ route: "'review' | 'on-call'" });

    test("is used when the workflow declares no output schema", async () => {
        const { model, result } = await generateScripted(
            [
                {
                    toolName: "write-workflow",
                    input: { definition: routed(), submitIfValid: true },
                },
            ],
            { workflowOutputSchema },
        );

        expect(model.doGenerateCalls).toHaveLength(1);
        expect(result.workflowDefinition?.outputSchema).toMatchObject({
            type: "object",
            required: ["route"],
        });
    });

    test("rejects a declared output schema that is broader", async () => {
        const { toolOutput } = await generateScripted(
            [
                {
                    toolName: "write-workflow",
                    input: {
                        definition: routed({
                            type: "object",
                            properties: { route: { type: "string" } },
                            required: ["route"],
                        }),
                        submitIfValid: true,
                    },
                },
                { toolName: "give-up", input: { reason: "Test complete." } },
            ],
            { workflowOutputSchema },
        );

        expect(toolOutput("call-1")).toMatchObject({
            output: {
                value: {
                    diagnostics: [
                        {
                            severity: "error",
                            message: expect.stringContaining(
                                "must be a subset of the required output schema",
                            ),
                        },
                    ],
                    submitted: false,
                },
            },
        });
    });
});

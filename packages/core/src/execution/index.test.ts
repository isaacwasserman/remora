import { describe, expect, test } from "bun:test";
import { tool } from "ai";
import { type } from "arktype";
import type { AgentConfig } from "../types";
import { step, workflow } from "../workflow-fixtures";
import { executeWorkflowStream } from ".";
import { createInMemoryExecutionEngine } from "./execution-engine/in-memory";
import type { ExecutionEngine } from "./execution-engine/types";
import { createMockModel } from "./test-support";
import type { ExecutionState } from "./types";

/** Drives `executeWorkflow` to completion and returns its final state. */
async function runWorkflow(
    args: Parameters<typeof executeWorkflowStream>[0],
): Promise<ExecutionState> {
    let last: ExecutionState | undefined;
    for await (const state of executeWorkflowStream(args)) {
        last = state;
    }
    if (!last) {
        throw new Error("executeWorkflow yielded no states");
    }
    return last;
}

// ─── Test Harness ────────────────────────────────────────────────
//
// These are integration tests: they drive the real `executeWorkflow`
// (validation → step-executor loop → execution engine) and only substitute the
// language model for a deterministic mock so no network / API key is required.
// See https://ai-sdk.dev/docs/ai-sdk-core/testing.md.
//
// Scenarios that actually execute steps are run with checkpointing off and on, to
// prove the executor behaves identically whether or not step results are being
// recorded. Scenarios that never reach the engine (e.g. the validation gate) live
// outside that matrix and run once.

/**
 * A fresh tool set for each test, plus a `calls` log so tests can assert which
 * tools ran, in what order, and with what input — the observable side effects
 * of an execution.
 */
function createToolset() {
    const calls: Array<{ tool: string; input: unknown }> = [];
    const record =
        <TInput, TOutput>(name: string, fn: (input: TInput) => TOutput) =>
        (input: TInput) => {
            calls.push({ tool: name, input });
            return fn(input);
        };

    const tools = {
        // Returns a fixed batch of support tickets (a stand-in for a CRM fetch).
        fetchTickets: tool({
            inputSchema: type({}),
            outputSchema: type({ tickets: "unknown[]" }),
            execute: record("fetchTickets", () => ({
                tickets: [
                    { id: 101, text: "The app crashes on launch" },
                    { id: 102, text: "Absolutely love the new update!" },
                ],
            })),
        }),
        // Posts a message to a channel; returns a delivery receipt.
        notify: tool({
            inputSchema: type({ channel: "string", message: "string" }),
            outputSchema: type({ delivered: "boolean", channel: "string" }),
            execute: record(
                "notify",
                ({ channel }: { channel: string; message: string }) => ({
                    delivered: true,
                    channel,
                }),
            ),
        }),
        // Escalates a ticket to on-call.
        escalate: tool({
            inputSchema: type({ ticketId: "number" }),
            outputSchema: type({ escalated: "boolean" }),
            execute: record("escalate", () => ({ escalated: true })),
        }),
        // Files a ticket into the normal queue.
        fileTicket: tool({
            inputSchema: type({ ticketId: "number" }),
            outputSchema: type({ filed: "boolean" }),
            execute: record("fileTicket", () => ({ filed: true })),
        }),
        // A tool that always fails, simulating a flaky external dependency.
        chargeCard: tool({
            inputSchema: type({ amount: "number" }),
            outputSchema: type({ ok: "boolean" }),
            execute: record("chargeCard", () => {
                throw new Error("payment gateway timeout");
            }),
        }),
    };

    return { tools, calls };
}

// ─── Engine matrix ───────────────────────────────────────────────

const ENGINES: Array<{
    name: string;
    create: () => ExecutionEngine;
}> = [
    { name: "no checkpointing", create: createInMemoryExecutionEngine },
    {
        name: "checkpointing",
        create: () => createInMemoryExecutionEngine({ checkpointing: true }),
    },
];

for (const engine of ENGINES) {
    /** Execution options for this engine, with a fresh engine instance. */
    const options = () => ({
        silenceLogs: true,
        executionEngine: engine.create(),
    });

    describe(`executeWorkflow [${engine.name}]`, () => {
        // ─── Scenario 1: linear tool → LLM → tool pipeline ───────

        describe("support ticket triage pipeline", () => {
            test("fetches a ticket, classifies it with the LLM, then notifies the right channel", async () => {
                const { tools, calls } = createToolset();
                const agentConfig: AgentConfig = {
                    tools,
                    model: createMockModel([
                        { sentiment: "negative", urgency: 5 },
                    ]),
                };

                const result = await runWorkflow({
                    workflowDefinition: workflow(
                        step("begin", { type: "start", nextStepId: "fetch" }),
                        step("fetch", {
                            type: "tool-call",
                            nextStepId: "classify",
                            params: { toolName: "fetchTickets", toolInput: {} },
                        }),
                        step("classify", {
                            type: "llm-prompt",
                            nextStepId: "alert",
                            params: {
                                prompt: "Classify this ticket: ${fetch.tickets[0].text}",
                                outputFormat: {
                                    type: "object",
                                    properties: {
                                        sentiment: { type: "string" },
                                        urgency: { type: "number" },
                                    },
                                    required: ["sentiment", "urgency"],
                                },
                            },
                        }),
                        step("alert", {
                            type: "tool-call",
                            nextStepId: "finish",
                            params: {
                                toolName: "notify",
                                toolInput: {
                                    channel: {
                                        type: "jmespath",
                                        expression: "classify.sentiment",
                                    },
                                    message: {
                                        type: "template",
                                        template:
                                            "Ticket ${fetch.tickets[0].id} is ${classify.sentiment} (urgency ${classify.urgency})",
                                    },
                                },
                            },
                        }),
                        step("finish", {
                            type: "end",
                            params: {
                                output: {
                                    type: "jmespath",
                                    expression: "alert",
                                },
                            },
                        }),
                    ),
                    tools: agentConfig.tools,
                    model: agentConfig.model,
                    executionOptions: options(),
                });

                expect(result.status).toBe("success");
                expect(result.output).toEqual({
                    delivered: true,
                    channel: "negative",
                });

                // The LLM classification flowed into the tool input via JMESPath.
                expect(calls).toEqual([
                    { tool: "fetchTickets", input: {} },
                    {
                        tool: "notify",
                        input: {
                            channel: "negative",
                            message: "Ticket 101 is negative (urgency 5)",
                        },
                    },
                ]);
            });
        });

        // ─── Scenario 2: for-each fan-out over a collection ──────

        describe("for-each batch processing", () => {
            test("runs the loop body once per item, threading the loop variable into each tool call", async () => {
                const { tools, calls } = createToolset();
                const agentConfig: AgentConfig = {
                    tools,
                    model: createMockModel([]),
                };

                const result = await runWorkflow({
                    workflowDefinition: workflow(
                        step("begin", { type: "start", nextStepId: "fetch" }),
                        step("fetch", {
                            type: "tool-call",
                            nextStepId: "loop",
                            params: { toolName: "fetchTickets", toolInput: {} },
                        }),
                        step("loop", {
                            type: "for-each",
                            nextStepId: "finish",
                            params: {
                                target: {
                                    type: "jmespath",
                                    expression: "fetch.tickets",
                                },
                                itemName: "ticket",
                                loopBodyStepId: "fileOne",
                            },
                        }),
                        step("fileOne", {
                            type: "tool-call",
                            params: {
                                toolName: "fileTicket",
                                toolInput: {
                                    ticketId: {
                                        type: "jmespath",
                                        expression: "ticket.id",
                                    },
                                },
                            },
                        }),
                        step("finish", {
                            type: "end",
                            params: {
                                output: {
                                    type: "jmespath",
                                    expression: "fetch.tickets",
                                },
                            },
                        }),
                    ),
                    tools: agentConfig.tools,
                    model: agentConfig.model,
                    executionOptions: options(),
                });

                expect(result.status).toBe("success");

                // fileTicket ran once per fetched ticket, each with the right id.
                const fileCalls = calls.filter((c) => c.tool === "fileTicket");
                expect(fileCalls).toEqual([
                    { tool: "fileTicket", input: { ticketId: 101 } },
                    { tool: "fileTicket", input: { ticketId: 102 } },
                ]);

                // Each loop iteration retains its own runtime record, rather
                // than overwriting the authored step's previous result.
                const fileExecutions = result.stepExecutions.filter(
                    (execution) => execution.stepId === "fileOne",
                );
                expect(fileExecutions).toHaveLength(2);
                expect(
                    fileExecutions.map((execution) => execution.output),
                ).toEqual([{ filed: true }, { filed: true }]);
                expect(
                    fileExecutions.map(
                        (execution) => execution.renderedParams?.toolInput,
                    ),
                ).toEqual([{ ticketId: 101 }, { ticketId: 102 }]);
                expect(
                    fileExecutions.map((execution) => execution.invocationPath),
                ).toEqual([
                    ["loop", "0", "fileOne"],
                    ["loop", "1", "fileOne"],
                ]);
            });
        });

        // ─── Scenario 3: switch-case conditional routing ─────────

        describe("switch-case routing", () => {
            test("takes the matching branch and skips the others", async () => {
                const { tools, calls } = createToolset();
                const agentConfig: AgentConfig = {
                    tools,
                    // LLM decides the priority the switch branches on.
                    model: createMockModel([{ priority: "high" }]),
                };

                const result = await runWorkflow({
                    workflowDefinition: workflow(
                        step("begin", { type: "start", nextStepId: "triage" }),
                        step("triage", {
                            type: "llm-prompt",
                            nextStepId: "route",
                            params: {
                                prompt: "Assign a priority to this incident.",
                                outputFormat: {
                                    type: "object",
                                    properties: {
                                        priority: { type: "string" },
                                    },
                                    required: ["priority"],
                                },
                            },
                        }),
                        step("route", {
                            type: "switch-case",
                            nextStepId: "finish",
                            params: {
                                switchOn: {
                                    type: "jmespath",
                                    expression: "triage.priority",
                                },
                                cases: [
                                    {
                                        value: {
                                            type: "literal",
                                            value: "high",
                                        },
                                        branchBodyStepId: "escalateBranch",
                                    },
                                    {
                                        value: { type: "default" },
                                        branchBodyStepId: "fileBranch",
                                    },
                                ],
                            },
                        }),
                        step("escalateBranch", {
                            type: "tool-call",
                            params: {
                                toolName: "escalate",
                                toolInput: {
                                    ticketId: { type: "literal", value: 101 },
                                },
                            },
                        }),
                        step("fileBranch", {
                            type: "tool-call",
                            params: {
                                toolName: "fileTicket",
                                toolInput: {
                                    ticketId: { type: "literal", value: 101 },
                                },
                            },
                        }),
                        step("finish", {
                            type: "end",
                            params: {
                                output: {
                                    type: "jmespath",
                                    expression: "triage.priority",
                                },
                            },
                        }),
                    ),
                    tools: agentConfig.tools,
                    model: agentConfig.model,
                    executionOptions: options(),
                });

                expect(result.status).toBe("success");
                expect(result.output).toBe("high");

                // Only the "high" branch ran; the default branch's tool never fired.
                const toolNames = calls.map((c) => c.tool);
                expect(toolNames).toContain("escalate");
                expect(toolNames).not.toContain("fileTicket");
            });

            test("uses the selected terminal branch output for workflow output validation", async () => {
                const { tools } = createToolset();
                const result = await runWorkflow({
                    workflowDefinition: {
                        ...workflow(
                            step("route", {
                                type: "switch-case",
                                params: {
                                    switchOn: {
                                        type: "literal",
                                        value: "selected",
                                    },
                                    cases: [
                                        {
                                            value: { type: "default" },
                                            branchBodyStepId: "selectedEnd",
                                        },
                                        {
                                            value: {
                                                type: "literal",
                                                value: "not-selected",
                                            },
                                            branchBodyStepId: "unselectedEnd",
                                        },
                                    ],
                                },
                            }),
                            step("selectedEnd", {
                                type: "end",
                                params: {
                                    output: {
                                        type: "literal",
                                        value: { result: "selected" },
                                    },
                                },
                            }),
                            step("unselectedEnd", {
                                type: "end",
                                params: {
                                    output: {
                                        type: "literal",
                                        value: {},
                                    },
                                },
                            }),
                        ),
                        outputSchema: {
                            type: "object",
                            properties: { result: { type: "string" } },
                            required: ["result"],
                        },
                    },
                    tools,
                    model: createMockModel([]),
                    executionOptions: options(),
                });

                expect(result).toMatchObject({
                    status: "success",
                    output: { result: "selected" },
                });
                expect(
                    result.stepExecutions.some(
                        (execution) => execution.stepId === "unselectedEnd",
                    ),
                ).toBeFalse();
            });
        });

        // ─── Scenario 4: a failing tool aborts the run ───────────

        describe("tool failure propagation", () => {
            test("surfaces a TOOL_ERROR when a tool throws and stops execution", async () => {
                const { tools, calls } = createToolset();
                const agentConfig: AgentConfig = {
                    tools,
                    model: createMockModel([]),
                };

                const result = await runWorkflow({
                    workflowDefinition: workflow(
                        step("begin", { type: "start", nextStepId: "charge" }),
                        step("charge", {
                            type: "tool-call",
                            nextStepId: "confirm",
                            params: {
                                toolName: "chargeCard",
                                toolInput: {
                                    amount: { type: "literal", value: 4200 },
                                },
                            },
                        }),
                        // Should never run because `charge` fails first.
                        step("confirm", {
                            type: "tool-call",
                            nextStepId: "finish",
                            params: {
                                toolName: "notify",
                                toolInput: {
                                    channel: {
                                        type: "literal",
                                        value: "billing",
                                    },
                                    message: {
                                        type: "literal",
                                        value: "charged",
                                    },
                                },
                            },
                        }),
                        step("finish", { type: "end" }),
                    ),
                    tools: agentConfig.tools,
                    model: agentConfig.model,
                    executionOptions: options(),
                });

                expect(result.status).toBe("error");
                expect(result.output).toBeNull();
                expect(result.error?.code).toBe("TOOL_ERROR");
                expect(result.error?.message).toContain(
                    "payment gateway timeout",
                );

                // Execution halted at the failing step — the downstream tool never ran.
                const toolNames = calls.map((c) => c.tool);
                expect(toolNames).toEqual(["chargeCard"]);
            });
        });
    });
}

// ─── Validation gate ─────────────────────────────────────────────
//
// Validation runs before any execution engine is touched, so this scenario is
// engine-independent and runs once.

describe("executeWorkflow validation gate", () => {
    test("rejects a workflow that references an unknown tool without executing anything", async () => {
        const { tools, calls } = createToolset();
        const agentConfig: AgentConfig = {
            tools,
            model: createMockModel([]),
        };

        const result = await runWorkflow({
            workflowDefinition: workflow(
                step("begin", { type: "start", nextStepId: "typo" }),
                step("typo", {
                    type: "tool-call",
                    nextStepId: "finish",
                    params: {
                        // Misspelled tool name — should be caught by validation.
                        toolName: "notifyy",
                        toolInput: {
                            channel: { type: "literal", value: "ops" },
                            message: { type: "literal", value: "hi" },
                        },
                    },
                }),
                step("finish", { type: "end" }),
            ),
            tools: agentConfig.tools,
            model: agentConfig.model,
            executionOptions: {
                silenceLogs: true,
                executionEngine: createInMemoryExecutionEngine(),
            },
        });

        expect(result.status).toBe("error");
        expect(result.error?.code).toBe("INVALID_WORKFLOW");
        // `INVALID_WORKFLOW` is emitted for every validation failure, so pin the
        // diagnostic that identifies the misspelled tool specifically.
        expect(result.error?.message).toContain(
            'Step "typo": Tool "notifyy" is not available in the given toolset.',
        );
        // Nothing executed because validation failed up front.
        expect(calls).toEqual([]);
    });
});

describe("executeWorkflow option defaulting", () => {
    test("an explicitly undefined adapter still falls back to the default", async () => {
        const { tools } = createToolset();
        const agentConfig: AgentConfig = {
            tools,
            model: createMockModel([]),
        };

        const result = await runWorkflow({
            workflowDefinition: workflow(
                step("begin", { type: "start", nextStepId: "askIt" }),
                step("askIt", {
                    type: "request-intervention",
                    nextStepId: "finish",
                    params: {
                        type: "multiple-choice",
                        question: { type: "literal", value: "Ship it?" },
                        choices: { type: "literal", value: ["yes", "no"] },
                        allowFreeResponse: false,
                    },
                }),
                step("finish", { type: "end" }),
            ),
            tools: agentConfig.tools,
            model: agentConfig.model,
            executionOptions: {
                settings: { features: { allowUserIntervention: true } },
                silenceLogs: true,
                executionEngine: createInMemoryExecutionEngine(),
                userInterventionAdapter: undefined,
            },
        });

        expect(result.status).toBe("error");
        expect(result.error?.message).toContain(
            "no UserInterventionAdapter was provided at execution time",
        );
    });
});

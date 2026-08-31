import { describe, expect, test } from "bun:test";
import { tool } from "ai";
import { type } from "arktype";
import type { WorkflowDefinition } from "../schema";
import type { ToolSet } from "../types";
import { step, workflow } from "../workflow-fixtures";
import { executeWorkflow, executeWorkflowStream } from ".";
import type { ApprovalPolicy } from "./approval-policies/types";
import { createInMemoryExecutionEngine } from "./execution-engine/in-memory";
import type { ExecutionEngine } from "./execution-engine/types";
import {
    createMockModel,
    createMockUserInterventionAdapter,
    createScriptedMockModel,
    failingModel,
} from "./test-support";
import type { ExecutionOptions, ExecutionState } from "./types";

type WorkflowArgs = Parameters<typeof executeWorkflow>[0];

const objectSchema = {
    type: "object" as const,
    additionalProperties: true,
};

const answerSchema = {
    type: "object" as const,
    properties: { answer: { type: "string" as const } },
    required: ["answer"],
};

const ENGINES: Array<{
    name: string;
    create: () => ExecutionEngine;
}> = [
    { name: "plain in-memory", create: createInMemoryExecutionEngine },
    {
        name: "checkpointing in-memory",
        create: () => createInMemoryExecutionEngine({ checkpointing: true }),
    },
];

function executionOptions(
    engine: ExecutionEngine,
    overrides: ExecutionOptions = {},
): ExecutionOptions {
    return {
        silenceLogs: true,
        executionEngine: engine,
        ...overrides,
        settings: {
            features: { allowUserIntervention: true },
            duration: { minPollIntervalSeconds: 0 },
            stepRetry: { retryDelaySeconds: 0 },
            ...overrides.settings,
        },
    };
}

function withEngine(
    engine: ExecutionEngine,
    args: WorkflowArgs,
    overrides: ExecutionOptions = {},
): WorkflowArgs {
    return {
        ...args,
        executionOptions: executionOptions(engine, {
            ...args.executionOptions,
            ...overrides,
        }),
    };
}

async function collectStates(
    args: WorkflowArgs,
    onState?: (state: ExecutionState) => void,
): Promise<ExecutionState[]> {
    const states: ExecutionState[] = [];
    for await (const state of executeWorkflowStream(args)) {
        states.push(state);
        onState?.(state);
    }
    return states;
}

function requestApprovalPolicy(
    scope: ApprovalPolicy["scope"] = "all",
): ApprovalPolicy {
    return {
        id: "request-sensitive-actions",
        scope,
        decideFn: () => ({
            policyId: "request-sensitive-actions",
            decision: "request",
        }),
    };
}

function asToolSet(tools: Record<string, unknown>): ToolSet {
    return tools as unknown as ToolSet;
}

for (const engineCase of ENGINES) {
    describe(`workflow execution end to end [${engineCase.name}]`, () => {
        test("executes a minimal typed start-to-end workflow", async () => {
            const definition: WorkflowDefinition = {
                ...workflow(
                    step("start", { type: "start", nextStepId: "finish" }),
                    step("finish", {
                        type: "end",
                        params: {
                            output: {
                                type: "jmespath",
                                expression: "input",
                            },
                        },
                    }),
                ),
                inputSchema: objectSchema,
                outputSchema: objectSchema,
            };
            const input = { id: "minimal", nested: { ok: true } };

            const result = await executeWorkflow(
                withEngine(engineCase.create(), {
                    workflowDefinition: definition,
                    tools: {},
                    model: createMockModel([]),
                    input,
                }),
            );

            expect(result).toMatchObject({
                status: "success",
                output: input,
                error: null,
            });
            expect(result.scope.input).toEqual(input);
            expect(result.scope.finish).toEqual(input);
            expect(
                result.stepExecutions.map(({ stepId, status }) => [
                    stepId,
                    status,
                ]),
            ).toEqual([
                ["start", "completed"],
                ["finish", "completed"],
            ]);
        });

        test("preserves falsy and nested values through expressions and a tool", async () => {
            const calls: unknown[] = [];
            const echo = tool({
                inputSchema: type({
                    disabled: "boolean",
                    count: "number",
                    label: "string",
                    missing: "null",
                    nested: "unknown",
                }),
                outputSchema: type("unknown"),
                execute: (input) => {
                    calls.push(input);
                    return input;
                },
            });
            const input = {
                disabled: false,
                count: 0,
                label: "",
                missing: null,
                nested: { values: [0, false, "", null] },
            };

            const result = await executeWorkflow(
                withEngine(engineCase.create(), {
                    workflowDefinition: {
                        ...workflow(
                            step("start", {
                                type: "start",
                                nextStepId: "echo",
                            }),
                            step("echo", {
                                type: "tool-call",
                                nextStepId: "finish",
                                params: {
                                    toolName: "echo",
                                    toolInput: {
                                        disabled: {
                                            type: "jmespath",
                                            expression: "input.disabled",
                                        },
                                        count: {
                                            type: "jmespath",
                                            expression: "input.count",
                                        },
                                        label: {
                                            type: "jmespath",
                                            expression: "input.label",
                                        },
                                        missing: {
                                            type: "jmespath",
                                            expression: "input.missing",
                                        },
                                        nested: {
                                            type: "jmespath",
                                            expression: "input.nested",
                                        },
                                    },
                                },
                            }),
                            step("finish", {
                                type: "end",
                                params: {
                                    output: {
                                        type: "jmespath",
                                        expression: "echo",
                                    },
                                },
                            }),
                        ),
                        inputSchema: objectSchema,
                        outputSchema: objectSchema,
                    },
                    tools: asToolSet({ echo }),
                    model: createMockModel([]),
                    input,
                }),
            );

            expect(result.status).toBe("success");
            expect(result.output).toEqual(input);
            expect(calls).toEqual([input]);
            expect(
                result.stepExecutions.find(({ stepId }) => stepId === "echo")
                    ?.renderedParams?.toolInput,
            ).toEqual(input);
        });

        test("threads tool and LLM outputs through a linear pipeline", async () => {
            const calls: Array<{ tool: string; input: unknown }> = [];
            const tools = {
                fetchTicket: tool({
                    inputSchema: type({ id: "number" }),
                    outputSchema: type({ id: "number", text: "string" }),
                    execute: ({ id }: { id: number }) => {
                        calls.push({ tool: "fetchTicket", input: { id } });
                        return { id, text: "service unavailable" };
                    },
                }),
                notify: tool({
                    inputSchema: type({ channel: "string", message: "string" }),
                    outputSchema: type({ delivered: "boolean" }),
                    execute: (input) => {
                        calls.push({ tool: "notify", input });
                        return { delivered: true };
                    },
                }),
            };
            const model = createMockModel([
                { sentiment: "negative", urgency: 5 },
            ]);

            const result = await executeWorkflow(
                withEngine(engineCase.create(), {
                    workflowDefinition: workflow(
                        step("start", { type: "start", nextStepId: "fetch" }),
                        step("fetch", {
                            type: "tool-call",
                            nextStepId: "classify",
                            params: {
                                toolName: "fetchTicket",
                                toolInput: {
                                    id: { type: "literal", value: 101 },
                                },
                            },
                        }),
                        step("classify", {
                            type: "llm-prompt",
                            nextStepId: "notify",
                            params: {
                                prompt: "Classify ticket ${fetch.id}: ${fetch.text}",
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
                        step("notify", {
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
                                            "Ticket ${fetch.id} urgency ${classify.urgency}",
                                    },
                                },
                            },
                        }),
                        step("finish", {
                            type: "end",
                            params: {
                                output: {
                                    type: "jmespath",
                                    expression: "notify",
                                },
                            },
                        }),
                    ),
                    tools: asToolSet(tools),
                    model,
                }),
            );

            expect(result).toMatchObject({
                status: "success",
                output: { delivered: true },
            });
            expect(calls).toEqual([
                { tool: "fetchTicket", input: { id: 101 } },
                {
                    tool: "notify",
                    input: {
                        channel: "negative",
                        message: "Ticket 101 urgency 5",
                    },
                },
            ]);
            expect(JSON.stringify(model.doGenerateCalls[0]?.prompt)).toContain(
                "service unavailable",
            );
        });

        test("extracts small and oversized data with generated data tools", async () => {
            const smallModel = createMockModel([{ answer: "small" }]);
            const small = await executeWorkflow(
                withEngine(engineCase.create(), {
                    workflowDefinition: workflow(
                        step("extract", {
                            type: "extract-data",
                            nextStepId: "finish",
                            params: {
                                sourceData: {
                                    type: "literal",
                                    value: { person: { name: "Ada" } },
                                },
                                outputFormat: answerSchema,
                            },
                        }),
                        step("finish", {
                            type: "end",
                            params: {
                                output: {
                                    type: "jmespath",
                                    expression: "extract",
                                },
                            },
                        }),
                    ),
                    tools: {},
                    model: smallModel,
                }),
            );
            expect(small).toMatchObject({
                status: "success",
                output: { answer: "small" },
            });
            expect(smallModel.doGenerateCalls[0]?.tools ?? []).toHaveLength(0);

            const largeModel = createScriptedMockModel([
                {
                    type: "tool-calls",
                    calls: [
                        {
                            toolCallId: "probe-1",
                            toolName: "probeData",
                            input: { jmespathExpression: "records[0].name" },
                        },
                    ],
                },
                { type: "object", value: { answer: "Ada" } },
            ]);
            const oversized = {
                records: Array.from({ length: 80 }, (_, index) => ({
                    name: index === 0 ? "Ada" : `Person ${index}`,
                    biography: "long biography ".repeat(10),
                })),
            };
            const large = await executeWorkflow(
                withEngine(engineCase.create(), {
                    workflowDefinition: workflow(
                        step("extract", {
                            type: "extract-data",
                            nextStepId: "finish",
                            params: {
                                sourceData: {
                                    type: "literal",
                                    value: oversized,
                                },
                                outputFormat: answerSchema,
                            },
                        }),
                        step("finish", {
                            type: "end",
                            params: {
                                output: {
                                    type: "jmespath",
                                    expression: "extract",
                                },
                            },
                        }),
                    ),
                    tools: {},
                    model: largeModel,
                    executionOptions: {
                        settings: { tokenBudgets: { maxDataTokens: 100 } },
                    },
                }),
            );

            expect(large).toMatchObject({
                status: "success",
                output: { answer: "Ada" },
            });
            expect(largeModel.doGenerateCalls).toHaveLength(2);
            expect(
                largeModel.doGenerateCalls[0]?.tools?.map(({ name }) => name),
            ).toEqual(["probeData"]);
            expect(
                JSON.stringify(largeModel.doGenerateCalls[1]?.prompt),
            ).toContain("Ada");
        });

        test("runs minimal and tool-using agent loops", async () => {
            const minimalModel = createMockModel([{ answer: "done" }]);
            const minimal = await executeWorkflow(
                withEngine(engineCase.create(), {
                    workflowDefinition: workflow(
                        step("agent", {
                            type: "agent-loop",
                            nextStepId: "finish",
                            params: {
                                instructions: "Return done",
                                tools: [],
                                outputFormat: answerSchema,
                            },
                        }),
                        step("finish", {
                            type: "end",
                            params: {
                                output: {
                                    type: "jmespath",
                                    expression: "agent",
                                },
                            },
                        }),
                    ),
                    tools: {},
                    model: minimalModel,
                }),
            );
            expect(minimal.output).toEqual({ answer: "done" });

            const toolCalls: unknown[] = [];
            const lookup = tool({
                inputSchema: type({ query: "string" }),
                outputSchema: type({ result: "string" }),
                execute: (input) => {
                    toolCalls.push(input);
                    return { result: "Ada Lovelace" };
                },
            });
            const agentModel = createScriptedMockModel([
                {
                    type: "tool-calls",
                    calls: [
                        {
                            toolCallId: "lookup-1",
                            toolName: "lookup",
                            input: { query: "first programmer" },
                        },
                    ],
                },
                { type: "object", value: { answer: "Ada Lovelace" } },
            ]);
            const agent = await executeWorkflow(
                withEngine(engineCase.create(), {
                    workflowDefinition: workflow(
                        step("agent", {
                            type: "agent-loop",
                            nextStepId: "finish",
                            params: {
                                instructions: "Identify the first programmer",
                                tools: ["lookup"],
                                outputFormat: answerSchema,
                            },
                        }),
                        step("finish", {
                            type: "end",
                            params: {
                                output: {
                                    type: "jmespath",
                                    expression: "agent",
                                },
                            },
                        }),
                    ),
                    tools: asToolSet({ lookup }),
                    model: agentModel,
                }),
            );

            expect(agent.output).toEqual({ answer: "Ada Lovelace" });
            expect(toolCalls).toEqual([{ query: "first programmer" }]);
            expect(agentModel.doGenerateCalls).toHaveLength(2);
            expect(
                agent.stepExecutions.find(({ stepId }) => stepId === "agent")
                    ?.state,
            ).toMatchObject({ maxSteps: 16 });
        });

        test("routes explicit, default, and unmatched switch cases", async () => {
            const calls: string[] = [];
            const mark = tool({
                inputSchema: type({ branch: "string" }),
                outputSchema: type({ branch: "string" }),
                execute: ({ branch }: { branch: string }) => {
                    calls.push(branch);
                    return { branch };
                },
            });
            const definition = (value: string, withDefault = true) =>
                workflow(
                    step("route", {
                        type: "switch-case",
                        nextStepId: "finish",
                        params: {
                            switchOn: { type: "literal", value },
                            cases: [
                                {
                                    value: { type: "literal", value: "known" },
                                    branchBodyStepId: "known",
                                },
                                ...(withDefault
                                    ? [
                                          {
                                              value: {
                                                  type: "default" as const,
                                              },
                                              branchBodyStepId: "fallback",
                                          },
                                      ]
                                    : []),
                            ],
                        },
                    }),
                    step("known", {
                        type: "tool-call",
                        params: {
                            toolName: "mark",
                            toolInput: {
                                branch: { type: "literal", value: "known" },
                            },
                        },
                    }),
                    ...(withDefault
                        ? [
                              step("fallback", {
                                  type: "tool-call",
                                  params: {
                                      toolName: "mark",
                                      toolInput: {
                                          branch: {
                                              type: "literal",
                                              value: "fallback",
                                          },
                                      },
                                  },
                              }),
                          ]
                        : []),
                    step("finish", {
                        type: "end",
                        params: { output: { type: "literal", value: "done" } },
                    }),
                );

            const matched = await executeWorkflow(
                withEngine(engineCase.create(), {
                    workflowDefinition: definition("known"),
                    tools: asToolSet({ mark }),
                    model: createMockModel([]),
                }),
            );
            const fallback = await executeWorkflow(
                withEngine(engineCase.create(), {
                    workflowDefinition: definition("other"),
                    tools: asToolSet({ mark }),
                    model: createMockModel([]),
                }),
            );
            const unmatched = await executeWorkflow(
                withEngine(engineCase.create(), {
                    workflowDefinition: definition("other", false),
                    tools: asToolSet({ mark }),
                    model: createMockModel([]),
                }),
            );

            expect(matched.status).toBe("success");
            expect(fallback.status).toBe("success");
            expect(calls).toEqual(["known", "fallback"]);
            expect(unmatched.error?.code).toBe("UNRECOGNIZED_CASE");
        });

        test("handles empty and accumulator for-each flows with nested routing", async () => {
            const appendCalls: unknown[] = [];
            const append = tool({
                inputSchema: type({ acc: "unknown[]", value: "string" }),
                outputSchema: type({ result: "unknown[]" }),
                execute: ({
                    acc,
                    value,
                }: {
                    acc: unknown[];
                    value: string;
                }) => {
                    appendCalls.push({ acc, value });
                    return { result: [...acc, value] };
                },
            });
            const definition = (items: unknown[]) =>
                workflow(
                    step("fold", {
                        type: "for-each",
                        nextStepId: "finish",
                        params: {
                            target: { type: "literal", value: items },
                            itemName: "item",
                            loopBodyStepId: "route",
                            accumulatorName: "acc",
                            accumulatorInitialValue: {
                                type: "literal",
                                value: [],
                            },
                        },
                    }),
                    step("route", {
                        type: "switch-case",
                        params: {
                            switchOn: {
                                type: "jmespath",
                                expression: "item.kind",
                            },
                            cases: [
                                {
                                    value: { type: "literal", value: "a" },
                                    branchBodyStepId: "appendA",
                                },
                                {
                                    value: { type: "default" },
                                    branchBodyStepId: "appendB",
                                },
                            ],
                        },
                    }),
                    step("appendA", {
                        type: "tool-call",
                        nextStepId: "endA",
                        params: {
                            toolName: "append",
                            toolInput: {
                                acc: {
                                    type: "jmespath",
                                    expression: "acc",
                                },
                                value: {
                                    type: "jmespath",
                                    expression: "item.value",
                                },
                            },
                        },
                    }),
                    step("endA", {
                        type: "end",
                        params: {
                            output: {
                                type: "jmespath",
                                expression: "appendA.result",
                            },
                        },
                    }),
                    step("appendB", {
                        type: "tool-call",
                        nextStepId: "endB",
                        params: {
                            toolName: "append",
                            toolInput: {
                                acc: {
                                    type: "jmespath",
                                    expression: "acc",
                                },
                                value: {
                                    type: "jmespath",
                                    expression: "item.value",
                                },
                            },
                        },
                    }),
                    step("endB", {
                        type: "end",
                        params: {
                            output: {
                                type: "jmespath",
                                expression: "appendB.result",
                            },
                        },
                    }),
                    step("finish", {
                        type: "end",
                        params: {
                            output: {
                                type: "jmespath",
                                expression: "fold",
                            },
                        },
                    }),
                );

            const empty = await executeWorkflow(
                withEngine(engineCase.create(), {
                    workflowDefinition: definition([]),
                    tools: asToolSet({ append }),
                    model: createMockModel([]),
                }),
            );
            expect(empty.output).toEqual([]);

            const folded = await executeWorkflow(
                withEngine(engineCase.create(), {
                    workflowDefinition: definition([
                        { kind: "a", value: "first" },
                        { kind: "b", value: "second" },
                    ]),
                    tools: asToolSet({ append }),
                    model: createMockModel([]),
                }),
            );

            expect(folded.output).toEqual(["first", "second"]);
            expect(appendCalls).toEqual([
                { acc: [], value: "first" },
                { acc: ["first"], value: "second" },
            ]);
            expect(folded.scope).not.toHaveProperty("item");
            expect(folded.scope).not.toHaveProperty("acc");
            expect(
                folded.stepExecutions
                    .filter(({ stepId }) => stepId.startsWith("append"))
                    .map(({ invocationPath }) => invocationPath),
            ).toEqual([
                ["fold", "0", "route", "0", "appendA"],
                ["fold", "1", "route", "1", "appendB"],
            ]);
        });

        test("handles immediately-false and accumulator while flows", async () => {
            let conditionCalls = 0;
            const probe = tool({
                inputSchema: type({}),
                outputSchema: type({ go: "boolean" }),
                execute: () => ({ go: ++conditionCalls <= 2 }),
            });
            const increment = tool({
                inputSchema: type({ value: "number" }),
                outputSchema: type({ value: "number" }),
                execute: ({ value }: { value: number }) => ({
                    value: value + 1,
                }),
            });
            const definition = (conditionStepId: string) =>
                workflow(
                    step("loop", {
                        type: "while",
                        nextStepId: "finish",
                        params: {
                            conditionStepId,
                            loopBodyStepId: "increment",
                            accumulatorName: "total",
                            accumulatorInitialValue: {
                                type: "literal",
                                value: 0,
                            },
                        },
                    }),
                    ...(conditionStepId === "probe"
                        ? [
                              step("probe", {
                                  type: "tool-call",
                                  nextStepId: "probeEnd",
                                  params: {
                                      toolName: "probe",
                                      toolInput: {},
                                  },
                              }),
                              step("probeEnd", {
                                  type: "end",
                                  params: {
                                      output: {
                                          type: "jmespath",
                                          expression: "probe.go",
                                      },
                                  },
                              }),
                          ]
                        : [
                              step("falseCondition", {
                                  type: "end",
                                  params: {
                                      output: {
                                          type: "literal",
                                          value: false,
                                      },
                                  },
                              }),
                          ]),
                    step("increment", {
                        type: "tool-call",
                        nextStepId: "incrementEnd",
                        params: {
                            toolName: "increment",
                            toolInput: {
                                value: {
                                    type: "jmespath",
                                    expression: "total",
                                },
                            },
                        },
                    }),
                    step("incrementEnd", {
                        type: "end",
                        params: {
                            output: {
                                type: "jmespath",
                                expression: "increment.value",
                            },
                        },
                    }),
                    step("finish", {
                        type: "end",
                        params: {
                            output: {
                                type: "jmespath",
                                expression: "loop",
                            },
                        },
                    }),
                );

            const immediate = await executeWorkflow(
                withEngine(engineCase.create(), {
                    workflowDefinition: definition("falseCondition"),
                    tools: asToolSet({ probe, increment }),
                    model: createMockModel([]),
                }),
            );
            expect(immediate.output).toBe(0);

            const repeated = await executeWorkflow(
                withEngine(engineCase.create(), {
                    workflowDefinition: definition("probe"),
                    tools: asToolSet({ probe, increment }),
                    model: createMockModel([]),
                }),
            );
            expect(repeated.output).toBe(2);
            expect(conditionCalls).toBe(3);
            expect(
                repeated.stepExecutions
                    .filter(({ stepId }) => stepId === "increment")
                    .map(({ invocationPath }) => invocationPath),
            ).toEqual([
                ["loop", "0", "increment"],
                ["loop", "1", "increment"],
            ]);
        });

        test("streams sleep and wait-for-condition progress until ready", async () => {
            let probes = 0;
            const probe = tool({
                inputSchema: type({}),
                outputSchema: type({ ready: "boolean" }),
                execute: () => ({ ready: ++probes >= 2 }),
            });
            const states = await collectStates(
                withEngine(engineCase.create(), {
                    workflowDefinition: workflow(
                        step("start", { type: "start", nextStepId: "pause" }),
                        step("pause", {
                            type: "sleep",
                            nextStepId: "wait",
                            params: {
                                durationMs: { type: "literal", value: 0 },
                            },
                        }),
                        step("wait", {
                            type: "wait-for-condition",
                            nextStepId: "finish",
                            params: {
                                conditionStepId: "probe",
                                condition: {
                                    type: "jmespath",
                                    expression: "probe.ready",
                                },
                                intervalMs: { type: "literal", value: 0 },
                                maxAttempts: { type: "literal", value: 3 },
                            },
                        }),
                        step("probe", {
                            type: "tool-call",
                            params: { toolName: "probe", toolInput: {} },
                        }),
                        step("finish", {
                            type: "end",
                            params: {
                                output: {
                                    type: "jmespath",
                                    expression: "wait",
                                },
                            },
                        }),
                    ),
                    tools: asToolSet({ probe }),
                    model: createMockModel([]),
                }),
            );

            expect(states.at(-1)).toMatchObject({
                status: "success",
                output: true,
            });
            expect(states.map(({ status }) => status)).toContain("sleeping");
            expect(states.map(({ status }) => status)).toContain(
                "awaiting-condition",
            );
            expect(probes).toBe(2);
            expect(
                states
                    .at(-1)
                    ?.stepExecutions.filter(({ stepId }) => stepId === "probe")
                    .map(({ invocationPath }) => invocationPath),
            ).toEqual([
                ["wait", "attempt", "0", "probe"],
                ["wait", "attempt", "1", "probe"],
            ]);
        });

        test("renders and answers direct user intervention before routing", async () => {
            const intervention = createMockUserInterventionAdapter([
                { answer: "Ship", pendingReads: 1 },
            ]);
            const tools = asToolSet({
                prepare: tool({
                    inputSchema: type({}),
                    outputSchema: type({
                        question: "string",
                        choices: "string[]",
                    }),
                    execute: () => ({
                        question: "Deploy release 42?",
                        choices: ["Ship", "Hold"],
                    }),
                }),
            });
            const states = await collectStates(
                withEngine(engineCase.create(), {
                    workflowDefinition: workflow(
                        step("prepare", {
                            type: "tool-call",
                            nextStepId: "ask",
                            params: { toolName: "prepare", toolInput: {} },
                        }),
                        step("ask", {
                            type: "request-intervention",
                            nextStepId: "route",
                            params: {
                                type: "multiple-choice",
                                question: {
                                    type: "jmespath",
                                    expression: "prepare.question",
                                },
                                choices: {
                                    type: "jmespath",
                                    expression: "prepare.choices",
                                },
                                allowFreeResponse: false,
                            },
                        }),
                        step("route", {
                            type: "switch-case",
                            params: {
                                switchOn: {
                                    type: "jmespath",
                                    expression: "ask",
                                },
                                cases: [
                                    {
                                        value: {
                                            type: "literal",
                                            value: "Ship",
                                        },
                                        branchBodyStepId: "shipped",
                                    },
                                    {
                                        value: { type: "default" },
                                        branchBodyStepId: "held",
                                    },
                                ],
                            },
                        }),
                        step("shipped", {
                            type: "end",
                            params: {
                                output: { type: "literal", value: "shipped" },
                            },
                        }),
                        step("held", {
                            type: "end",
                            params: {
                                output: { type: "literal", value: "held" },
                            },
                        }),
                    ),
                    tools,
                    model: createMockModel([]),
                    executionOptions: {
                        userInterventionAdapter: intervention.adapter,
                    },
                }),
                (state) => {
                    if (state.status === "awaiting-input") {
                        intervention.events.push("status:awaiting-input");
                    }
                },
            );

            expect(states.at(-1)).toMatchObject({
                status: "success",
                output: "shipped",
            });
            expect(states.map(({ status }) => status)).toContain(
                "awaiting-input",
            );
            expect(intervention.requests[0]?.request).toEqual({
                type: "multiple-choice",
                question: "Deploy release 42?",
                choices: ["Ship", "Hold"],
                allowFreeResponse: false,
            });
            expect(intervention.reads).toHaveLength(2);
            const requestIndex = intervention.events.findIndex((event) =>
                event.startsWith("request:"),
            );
            const statusIndex = intervention.events.indexOf(
                "status:awaiting-input",
            );
            const readIndex = intervention.events.findIndex((event) =>
                event.startsWith("read:"),
            );
            expect(requestIndex).toBeLessThan(statusIndex);
            expect(statusIndex).toBeLessThan(readIndex);
        });

        test("approves and rejects protected tool-call steps", async () => {
            let calls = 0;
            const mutate = tool({
                inputSchema: type({ value: "number" }),
                outputSchema: type({ value: "number" }),
                execute: ({ value }: { value: number }) => {
                    calls++;
                    return { value };
                },
            });
            const definition = workflow(
                step("mutate", {
                    type: "tool-call",
                    nextStepId: "finish",
                    params: {
                        toolName: "mutate",
                        toolInput: {
                            value: { type: "literal", value: 7 },
                        },
                    },
                }),
                step("finish", {
                    type: "end",
                    params: {
                        output: {
                            type: "jmespath",
                            expression: "mutate.value",
                        },
                    },
                }),
            );
            const approval = createMockUserInterventionAdapter([
                { answer: "Approve" },
            ]);
            const approved = await executeWorkflow(
                withEngine(engineCase.create(), {
                    workflowDefinition: definition,
                    tools: asToolSet({ mutate }),
                    model: createMockModel([]),
                    executionOptions: {
                        approvalPolicies: [
                            requestApprovalPolicy("only-tool-call-steps"),
                        ],
                        userInterventionAdapter: approval.adapter,
                    },
                }),
            );
            expect(approved.output).toBe(7);
            expect(calls).toBe(1);

            const rejection = createMockUserInterventionAdapter([
                { answer: "Reject" },
            ]);
            const rejected = await executeWorkflow(
                withEngine(engineCase.create(), {
                    workflowDefinition: definition,
                    tools: asToolSet({ mutate }),
                    model: createMockModel([]),
                    executionOptions: {
                        approvalPolicies: [
                            requestApprovalPolicy("only-tool-call-steps"),
                        ],
                        userInterventionAdapter: rejection.adapter,
                    },
                }),
            );
            expect(rejected.error?.code).toBe("POLICY_DENIED");
            expect(calls).toBe(1);
        });

        test("carries agent-loop approval responses into the next model turn", async () => {
            const run = async (answer: "Approve" | "Reject") => {
                const calls: unknown[] = [];
                const sensitive = tool({
                    inputSchema: type({ id: "number" }),
                    outputSchema: type({ changed: "boolean" }),
                    execute: (input) => {
                        calls.push(input);
                        return { changed: true };
                    },
                });
                const model = createScriptedMockModel([
                    {
                        type: "tool-calls",
                        calls: [
                            {
                                toolCallId: `sensitive-${answer}`,
                                toolName: "sensitive",
                                input: { id: 42 },
                            },
                        ],
                    },
                    {
                        type: "object",
                        value: {
                            answer: answer === "Approve" ? "changed" : "denied",
                        },
                    },
                ]);
                const intervention = createMockUserInterventionAdapter([
                    { answer },
                ]);
                const result = await executeWorkflow(
                    withEngine(engineCase.create(), {
                        workflowDefinition: workflow(
                            step("agent", {
                                type: "agent-loop",
                                nextStepId: "finish",
                                params: {
                                    instructions:
                                        "Perform the sensitive action",
                                    tools: ["sensitive"],
                                    outputFormat: answerSchema,
                                },
                            }),
                            step("finish", {
                                type: "end",
                                params: {
                                    output: {
                                        type: "jmespath",
                                        expression: "agent",
                                    },
                                },
                            }),
                        ),
                        tools: asToolSet({ sensitive }),
                        model,
                        executionOptions: {
                            approvalPolicies: [
                                requestApprovalPolicy("only-agent-loop-steps"),
                            ],
                            userInterventionAdapter: intervention.adapter,
                        },
                    }),
                );
                return { calls, intervention, model, result };
            };

            const approved = await run("Approve");
            expect(approved.result.output).toEqual({ answer: "changed" });
            expect(approved.calls).toEqual([{ id: 42 }]);
            expect(
                JSON.stringify(approved.model.doGenerateCalls[1]?.prompt),
            ).toContain('"type":"tool-result"');
            expect(
                JSON.stringify(approved.model.doGenerateCalls[1]?.prompt),
            ).toContain('"changed":true');

            const rejected = await run("Reject");
            expect(rejected.result.output).toEqual({ answer: "denied" });
            expect(rejected.calls).toEqual([]);
            expect(
                JSON.stringify(rejected.model.doGenerateCalls[1]?.prompt),
            ).toContain("denied");
        });

        test("retries a transient tool error without duplicating downstream work", async () => {
            let attempts = 0;
            let downstreamCalls = 0;
            const flaky = tool({
                inputSchema: type({}),
                outputSchema: type({ value: "number" }),
                execute: () => {
                    attempts++;
                    if (attempts === 1) throw new Error("temporary outage");
                    return { value: 9 };
                },
            });
            const downstream = tool({
                inputSchema: type({ value: "number" }),
                outputSchema: type({ value: "number" }),
                execute: ({ value }: { value: number }) => {
                    downstreamCalls++;
                    return { value };
                },
            });

            const result = await executeWorkflow(
                withEngine(engineCase.create(), {
                    workflowDefinition: workflow(
                        step("flaky", {
                            type: "tool-call",
                            nextStepId: "downstream",
                            params: { toolName: "flaky", toolInput: {} },
                        }),
                        step("downstream", {
                            type: "tool-call",
                            nextStepId: "finish",
                            params: {
                                toolName: "downstream",
                                toolInput: {
                                    value: {
                                        type: "jmespath",
                                        expression: "flaky.value",
                                    },
                                },
                            },
                        }),
                        step("finish", {
                            type: "end",
                            params: {
                                output: {
                                    type: "jmespath",
                                    expression: "downstream.value",
                                },
                            },
                        }),
                    ),
                    tools: asToolSet({ flaky, downstream }),
                    model: createMockModel([]),
                    executionOptions: {
                        settings: {
                            stepRetry: {
                                maxAttempts: 2,
                                retryDelaySeconds: 0,
                            },
                        },
                    },
                }),
            );

            expect(result).toMatchObject({ status: "success", output: 9 });
            expect(attempts).toBe(2);
            expect(downstreamCalls).toBe(1);
        });

        test("stops downstream work for runtime collaborator failures", async () => {
            let downstreamCalls = 0;
            const downstream = tool({
                inputSchema: type({}),
                outputSchema: type({ ok: "boolean" }),
                execute: () => {
                    downstreamCalls++;
                    return { ok: true };
                },
            });
            const llmDefinition = workflow(
                step("ask", {
                    type: "llm-prompt",
                    nextStepId: "downstream",
                    params: { prompt: "answer", outputFormat: answerSchema },
                }),
                step("downstream", {
                    type: "tool-call",
                    nextStepId: "finish",
                    params: { toolName: "downstream", toolInput: {} },
                }),
                step("finish", { type: "end" }),
            );

            const providerFailure = await executeWorkflow(
                withEngine(engineCase.create(), {
                    workflowDefinition: llmDefinition,
                    tools: asToolSet({ downstream }),
                    model: failingModel("provider unavailable"),
                }),
            );
            expect(providerFailure.error?.code).toBe("LLM_RUN_FAILED");

            const malformed = await executeWorkflow(
                withEngine(engineCase.create(), {
                    workflowDefinition: llmDefinition,
                    tools: asToolSet({ downstream }),
                    model: createScriptedMockModel([
                        { type: "text", text: "not json" },
                    ]),
                }),
            );
            expect(malformed.error?.code).toBe("LLM_RUN_FAILED");

            const broken = tool({
                inputSchema: type({}),
                outputSchema: type({ ok: "boolean" }),
                execute: () => {
                    throw new Error("tool backend unavailable");
                },
            });
            const toolFailure = await executeWorkflow(
                withEngine(engineCase.create(), {
                    workflowDefinition: workflow(
                        step("broken", {
                            type: "tool-call",
                            nextStepId: "downstream",
                            params: { toolName: "broken", toolInput: {} },
                        }),
                        step("downstream", {
                            type: "tool-call",
                            nextStepId: "finish",
                            params: {
                                toolName: "downstream",
                                toolInput: {},
                            },
                        }),
                        step("finish", { type: "end" }),
                    ),
                    tools: asToolSet({ broken, downstream }),
                    model: createMockModel([]),
                }),
            );
            expect(toolFailure.error?.code).toBe("TOOL_ERROR");

            const neverReady = tool({
                inputSchema: type({}),
                outputSchema: type({ ready: "boolean" }),
                execute: () => ({ ready: false }),
            });
            const waitFailure = await executeWorkflow(
                withEngine(engineCase.create(), {
                    workflowDefinition: workflow(
                        step("wait", {
                            type: "wait-for-condition",
                            nextStepId: "downstream",
                            params: {
                                conditionStepId: "neverReady",
                                condition: {
                                    type: "jmespath",
                                    expression: "neverReady.ready",
                                },
                                intervalMs: { type: "literal", value: 0 },
                                maxAttempts: { type: "literal", value: 2 },
                            },
                        }),
                        step("neverReady", {
                            type: "tool-call",
                            params: {
                                toolName: "neverReady",
                                toolInput: {},
                            },
                        }),
                        step("downstream", {
                            type: "tool-call",
                            nextStepId: "finish",
                            params: {
                                toolName: "downstream",
                                toolInput: {},
                            },
                        }),
                        step("finish", { type: "end" }),
                    ),
                    tools: asToolSet({ neverReady, downstream }),
                    model: createMockModel([]),
                }),
            );
            expect(waitFailure.error?.code).toBe("WAIT_FOR_CONDITION_FAILED");

            const intervention = createMockUserInterventionAdapter([
                { requestError: "supervisor unavailable" },
            ]);
            const interventionFailure = await executeWorkflow(
                withEngine(engineCase.create(), {
                    workflowDefinition: workflow(
                        step("ask", {
                            type: "request-intervention",
                            nextStepId: "downstream",
                            params: {
                                type: "multiple-choice",
                                question: {
                                    type: "literal",
                                    value: "Continue?",
                                },
                                choices: {
                                    type: "literal",
                                    value: ["yes", "no"],
                                },
                                allowFreeResponse: false,
                            },
                        }),
                        step("downstream", {
                            type: "tool-call",
                            nextStepId: "finish",
                            params: {
                                toolName: "downstream",
                                toolInput: {},
                            },
                        }),
                        step("finish", { type: "end" }),
                    ),
                    tools: asToolSet({ downstream }),
                    model: createMockModel([]),
                    executionOptions: {
                        userInterventionAdapter: intervention.adapter,
                    },
                }),
            );
            expect(interventionFailure.error?.code).toBe(
                "ASK_SUPERVISOR_ERROR",
            );
            expect(downstreamCalls).toBe(0);
        });
    });
}

describe("workflow execution validation and output gates", () => {
    test("invalid workflow and input execute no collaborators", async () => {
        let toolCalls = 0;
        const sideEffect = tool({
            inputSchema: type({}),
            outputSchema: type({ ok: "boolean" }),
            execute: () => {
                toolCalls++;
                return { ok: true };
            },
        });
        const invalidWorkflow = await executeWorkflow({
            workflowDefinition: workflow(
                step("missing", {
                    type: "tool-call",
                    params: { toolName: "unknown", toolInput: {} },
                }),
            ),
            tools: asToolSet({ sideEffect }),
            model: createMockModel([]),
        });
        expect(invalidWorkflow.error?.code).toBe("INVALID_WORKFLOW");

        const invalidInput = await executeWorkflow({
            workflowDefinition: {
                ...workflow(
                    step("sideEffect", {
                        type: "tool-call",
                        params: { toolName: "sideEffect", toolInput: {} },
                    }),
                ),
                inputSchema: {
                    type: "object",
                    properties: { id: { type: "number" } },
                    required: ["id"],
                },
            },
            tools: asToolSet({ sideEffect }),
            model: createMockModel([]),
            input: { id: "wrong" },
        });
        expect(invalidInput.error?.code).toBe("INVALID_INPUT");
        expect(toolCalls).toBe(0);
    });

    test("invalid terminal output retains completed execution evidence", async () => {
        const sideEffect = tool({
            inputSchema: type({}),
            outputSchema: type("unknown"),
            execute: () => ({ value: 42 }),
        });
        const result = await executeWorkflow({
            workflowDefinition: {
                ...workflow(
                    step("sideEffect", {
                        type: "tool-call",
                        nextStepId: "finish",
                        params: { toolName: "sideEffect", toolInput: {} },
                    }),
                    step("finish", {
                        type: "end",
                        params: {
                            output: {
                                type: "jmespath",
                                expression: "sideEffect.value",
                            },
                        },
                    }),
                ),
                outputSchema: { type: "string" },
            },
            tools: asToolSet({ sideEffect }),
            model: createMockModel([]),
            executionOptions: { silenceLogs: true },
        });

        expect(result.error?.code).toBe("INVALID_OUTPUT");
        expect(result.output).toBeNull();
        expect(result.scope).toMatchObject({
            sideEffect: { value: 42 },
            finish: 42,
        });
        expect(result.stepExecutions.map(({ status }) => status)).toEqual([
            "completed",
            "completed",
        ]);
    });
});

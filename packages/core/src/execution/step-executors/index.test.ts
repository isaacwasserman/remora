import { describe, expect, test } from "bun:test";
import { tool } from "ai";
import { type } from "arktype";
import type { WorkflowDefinition, WorkflowStep } from "../../schema";
import {
    type AgentConfig,
    remoraflowOptionsSchema,
    type ToolSet,
} from "../../types";
import { step, workflow } from "../../workflow-fixtures";
import { createExecutionContext } from "../execution-engine/context";
import { createInMemoryExecutionEngine } from "../execution-engine/in-memory";
import type { ExecutionContext, ExecutionRun } from "../execution-engine/types";
import { createMockModel, testDurationPolicy } from "../test-support";
import type {
    ExecutionError,
    ExecutionScope,
    ResolvedExecutionOptions,
    StepExecutor,
} from "../types";
import { defaultUserInterventionAdapter } from "../user-intervention/default-adapter";
import {
    createUserInverventionContext,
    type UserInterventionAdapter,
} from "../user-intervention/types";
import { stepExecutors } from ".";

/** A context whose durable delays are recorded rather than actually served. */
function makeContext(policyOverrides: Record<string, number> = {}) {
    const sleeps: number[] = [];
    const adapter = createInMemoryExecutionEngine();
    const run = adapter.createRun("proc", "run");
    const recording: ExecutionRun = {
        ...run,
        step: (name, fn, options) => run.step(name, fn, options),
        sleep: async (seconds) => {
            sleeps.push(seconds);
        },
    };
    return {
        context: createExecutionContext(
            recording,
            testDurationPolicy(policyOverrides),
        ),
        sleeps,
    };
}

function makeOptions(): ResolvedExecutionOptions {
    return {
        policy: remoraflowOptionsSchema.assert({}),
        silenceLogs: true,
        executionEngine: createInMemoryExecutionEngine(),
        userInterventionAdapter: defaultUserInterventionAdapter,
    };
}

function makeAgentConfig(tools: ToolSet = {}): AgentConfig {
    return { model: createMockModel([]), tools };
}

// Runs a single step through its executor with sensible defaults.
async function runStep(
    workflowStep: WorkflowStep,
    scope: ExecutionScope,
    {
        workflowDefinition = workflow(workflowStep),
        agentConfig = makeAgentConfig(),
        executionContext = makeContext().context,
        userInterventionAdapter: intervention = defaultUserInterventionAdapter,
    }: {
        workflowDefinition?: WorkflowDefinition;
        agentConfig?: AgentConfig;
        executionContext?: ExecutionContext;
        userInterventionAdapter?: UserInterventionAdapter;
    } = {},
) {
    // The map is keyed by step type, so indexing it with a union of types gives
    // a union of executors whose `execute` parameters are mutually exclusive.
    const executor = stepExecutors[workflowStep.type] as StepExecutor;
    let last:
        | { scope: ExecutionScope | null; error: ExecutionError | null }
        | undefined;
    for await (const update of executor.execute({
        uniqueStepIdPath: [workflowStep.id],
        step: workflowStep,
        scope,
        workflowDefinition,
        agentConfig,
        executionContext,
        userInterventionContext: createUserInverventionContext(intervention),
        options: makeOptions(),
    })) {
        last = { scope: update.scope, error: update.error };
    }
    return last ?? { scope: null, error: null };
}

describe("step executors", () => {
    test("start passes scope through unchanged", async () => {
        const result = await runStep(step("st", { type: "start" }), { a: 1 });
        expect(result).toEqual({ scope: { a: 1 }, error: null });
    });

    test("end writes the evaluated output to scope[step.id]", async () => {
        const end = step("en", {
            type: "end",
            params: { output: { type: "jmespath", expression: "value" } },
        });
        const result = await runStep(end, { value: 42 });
        expect(result).toEqual({ scope: { value: 42, en: 42 }, error: null });
    });

    test("sleep passes its authored duration to the context and leaves scope untouched", async () => {
        // The executor no longer clamps; it hands the authored duration to the
        // context, which is the layer holding the policy.
        const sleep = step("zz", {
            type: "sleep",
            params: { durationMs: { type: "literal", value: 4_000 } },
        });
        const { context, sleeps } = makeContext();
        const result = await runStep(
            sleep,
            { a: 1 },
            { executionContext: context },
        );
        expect(sleeps).toEqual([4]);
        expect(result).toEqual({ scope: { a: 1 }, error: null });
    });

    test("a sleep past the policy bound is clamped by the context", async () => {
        const sleep = step("zz", {
            type: "sleep",
            params: { durationMs: { type: "literal", value: 10_000_000 } },
        });
        const { context, sleeps } = makeContext({ maxSleepSeconds: 30 });
        await runStep(sleep, { a: 1 }, { executionContext: context });
        expect(sleeps).toEqual([30]);
    });

    describe("tool-call", () => {
        const toolCallStep = step("tc", {
            type: "tool-call",
            params: {
                toolName: "adder",
                toolInput: { n: { type: "jmespath", expression: "start" } },
            },
        });

        test("errors with MISSING_TOOL when the tool is absent", async () => {
            const result = await runStep(toolCallStep, { start: 1 });
            expect(result.error?.code).toBe("MISSING_TOOL");
        });

        test("errors with MISSING_TOOL_EXECUTION_FUNCTION", async () => {
            const adder = tool({
                inputSchema: type({ n: "number" }),
                outputSchema: type("number"),
            });
            const result = await runStep(
                toolCallStep,
                { start: 1 },
                { agentConfig: makeAgentConfig({ adder }) },
            );
            expect(result.error?.code).toBe("MISSING_TOOL_EXECUTION_FUNCTION");
        });

        test("wraps a thrown tool error as TOOL_ERROR", async () => {
            const adder = tool({
                inputSchema: type({ n: "number" }),
                outputSchema: type("number"),
                execute: () => {
                    throw new Error("kaboom");
                },
            });
            const result = await runStep(
                toolCallStep,
                { start: 1 },
                { agentConfig: makeAgentConfig({ adder }) },
            );
            expect(result.error?.code).toBe("TOOL_ERROR");
            expect(result.error?.message).toContain("kaboom");
        });
    });

    describe("switch-case", () => {
        const matched = step("matched", {
            type: "end",
            params: { output: { type: "literal", value: "A" } },
        });
        const fallback = step("fallback", {
            type: "end",
            params: { output: { type: "literal", value: "D" } },
        });
        const switchStep = step("sc", {
            type: "switch-case",
            params: {
                switchOn: { type: "jmespath", expression: "x" },
                cases: [
                    {
                        value: { type: "literal", value: "a" },
                        branchBodyStepId: "matched",
                    },
                    {
                        value: { type: "default" },
                        branchBodyStepId: "fallback",
                    },
                ],
            },
        });

        test("falls back to the default case", async () => {
            const result = await runStep(
                switchStep,
                { x: "zzz" },
                { workflowDefinition: workflow(switchStep, matched, fallback) },
            );
            expect(result.error).toBeNull();
            expect(result.scope?.fallback).toBe("D");
        });

        test("errors with UNRECOGNIZED_CASE when nothing matches", async () => {
            const noDefault = step("sc", {
                type: "switch-case",
                params: {
                    switchOn: { type: "jmespath", expression: "x" },
                    cases: [
                        {
                            value: { type: "literal", value: "a" },
                            branchBodyStepId: "matched",
                        },
                    ],
                },
            });
            const result = await runStep(
                noDefault,
                { x: "nope" },
                { workflowDefinition: workflow(noDefault, matched, fallback) },
            );
            expect(result.error?.code).toBe("UNRECOGNIZED_CASE");
        });
    });

    test("for-each collects each loop body's output into an array", async () => {
        const forEach = step("fe", {
            type: "for-each",
            params: {
                target: { type: "jmespath", expression: "items" },
                itemName: "item",
                loopBodyStepId: "body",
            },
        });
        const body = step("body", {
            type: "end",
            params: { output: { type: "jmespath", expression: "item" } },
        });
        const result = await runStep(
            forEach,
            { items: [1, 2, 3] },
            { workflowDefinition: workflow(forEach, body) },
        );
        expect(result.error).toBeNull();
        // The for-each step's output is the array of per-iteration loop body
        // outputs (each loop body ends in an `end` step outputting `item`).
        expect(result.scope?.fe).toEqual([1, 2, 3]);
    });
});

type AskSupervisorStep = Extract<
    WorkflowStep,
    { type: "request-intervention" }
>;

describe("request-intervention", () => {
    function ask(
        choices: AskSupervisorStep["params"]["choices"],
        allowFreeResponse: boolean,
    ): WorkflowStep {
        return step("ask", {
            type: "request-intervention",
            params: {
                type: "multiple-choice",
                question: { type: "literal", value: "Ship it?" },
                choices,
                allowFreeResponse,
            },
        });
    }

    const askStep = ask({ type: "literal", value: ["yes", "no"] }, false);

    test("binds the answer string to scope[step.id]", async () => {
        const result = await runStep(
            askStep,
            {},
            {
                userInterventionAdapter: {
                    requestIntervention: async () => {},
                    getResponse: async () => ({ answer: "yes" }),
                },
            },
        );
        expect(result.error).toBeNull();
        // The bare string, not the `{ answer }` transport wrapper — this is the
        // shape `getStepOutputType` declares for the step.
        expect(result.scope?.ask).toBe("yes");
    });

    test("errors when a dynamic choice list resolves to empty with no free response", async () => {
        // The literal case is rejected at validation time; a dynamic expression
        // can only be judged here, and must not reach the supervisor as a
        // question with nothing to answer.
        let asked = 0;
        const result = await runStep(
            ask({ type: "jmespath", expression: "noChoices" }, false),
            { noChoices: [] },
            {
                userInterventionAdapter: {
                    requestIntervention: async () => {
                        asked++;
                    },
                    getResponse: async () => ({ answer: "yes" }),
                },
            },
        );
        expect(result.error?.code).toBe("TYPE_ERROR");
        expect(result.error?.message).toContain("unanswerable");
        expect(asked).toBe(0);
    });

    test("accepts an empty dynamic choice list when a free response is allowed", async () => {
        const result = await runStep(
            ask({ type: "jmespath", expression: "noChoices" }, true),
            { noChoices: [] },
            {
                userInterventionAdapter: {
                    requestIntervention: async () => {},
                    getResponse: async () => ({ answer: "typed in" }),
                },
            },
        );
        expect(result.error).toBeNull();
        expect(result.scope?.ask).toBe("typed in");
    });

    test("surfaces a failed intervention request instead of waiting forever", async () => {
        // The adapter's failure arrives as a ServiceResult, not a throw; leaving
        // it unchecked used to drop it and poll for an answer to a question that
        // was never asked.
        const result = await runStep(
            askStep,
            {},
            {
                userInterventionAdapter: {
                    requestIntervention: async () => {
                        throw new Error("supervisor channel down");
                    },
                    getResponse: async () => ({ answer: "yes" }),
                },
            },
        );
        expect(result.error?.code).toBe("ASK_SUPERVISOR_ERROR");
        expect(result.error?.message).toContain("supervisor channel down");
    });

    test("surfaces a failed answer read instead of waiting forever", async () => {
        const result = await runStep(
            askStep,
            {},
            {
                userInterventionAdapter: {
                    requestIntervention: async () => {},
                    getResponse: async () => {
                        throw new Error("answer store unreachable");
                    },
                },
            },
        );
        expect(result.error?.code).toBe("ASK_SUPERVISOR_ERROR");
        expect(result.error?.message).toContain("answer store unreachable");
    });
});

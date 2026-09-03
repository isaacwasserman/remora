import { describe, expect, test } from "bun:test";
import { tool } from "ai";
import { type } from "arktype";
import type { WorkflowDefinition, WorkflowStep } from "../../schema";
import {
    type AgentConfig,
    remoraflowSettingsSchema,
    type ToolSet,
} from "../../types";
import { step, workflow } from "../../workflow-fixtures";
import { createExecutionContext } from "../execution-engine/context";
import { UnrecoverableExecutionError } from "../execution-engine/errors";
import { createInMemoryExecutionEngine } from "../execution-engine/in-memory";
import type { ExecutionContext, ExecutionRun } from "../execution-engine/types";
import { createMockModel, testPolicies } from "../test-support";
import type { ExecutionError, ExecutionScope, StepExecutor } from "../types";
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
    const run = adapter.createRun("run");
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
            testPolicies(policyOverrides),
        ),
        sleeps,
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
    try {
        for await (const update of executor.execute({
            uniqueStepIdPath: [workflowStep.id],
            step: workflowStep,
            scope,
            workflowDefinition,
            tools: agentConfig.tools,
            model: agentConfig.model,
            settings: remoraflowSettingsSchema.assert({}),
            approvalPolicies: [],
            executionContext,
            userInterventionContext:
                createUserInverventionContext(intervention),
        })) {
            last = { scope: update.scope, error: update.error };
        }
    } catch (e) {
        if (e instanceof UnrecoverableExecutionError) throw e;
        const message = e instanceof Error ? e.message : String(e);
        return {
            scope: null,
            error: { code: executor.errorCode, stepId: null, message },
        };
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

    test("for-each over an empty array produces an empty output", async () => {
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
            { items: [] },
            { workflowDefinition: workflow(forEach, body) },
        );
        expect(result.error).toBeNull();
        expect(result.scope?.fe).toEqual([]);
    });

    test("for-each propagates an error from a loop body step", async () => {
        const forEach = step("fe", {
            type: "for-each",
            params: {
                target: { type: "jmespath", expression: "items" },
                itemName: "item",
                loopBodyStepId: "callTool",
            },
        });
        const callTool = step("callTool", {
            type: "tool-call",
            params: {
                toolName: "missing",
                toolInput: {},
            },
        });
        const result = await runStep(
            forEach,
            { items: [1] },
            { workflowDefinition: workflow(forEach, callTool) },
        );
        expect(result.error?.code).toBe("MISSING_TOOL");
    });

    test("for-each with accumulator folds iterations", async () => {
        let callCount = 0;
        const add = tool({
            description: "add",
            inputSchema: type({ a: "number", b: "number" }),
            outputSchema: type({ sum: "number" }),
            execute: ({ a, b }: { a: number; b: number }) => {
                callCount++;
                return { sum: a + b };
            },
        });
        const forEach = step("fe", {
            type: "for-each",
            params: {
                target: { type: "literal", value: [1, 2, 3] },
                itemName: "item",
                loopBodyStepId: "body",
                accumulatorName: "acc",
                accumulatorInitialValue: { type: "literal", value: 0 },
            },
        });
        const body = step("body", {
            type: "tool-call",
            nextStepId: "bodyEnd",
            params: {
                toolName: "add",
                toolInput: {
                    a: { type: "jmespath", expression: "acc" },
                    b: { type: "jmespath", expression: "item" },
                },
            },
        });
        const bodyEnd = step("bodyEnd", {
            type: "end",
            params: {
                output: { type: "jmespath", expression: "body.sum" },
            },
        });
        const result = await runStep(
            forEach,
            {},
            {
                workflowDefinition: workflow(forEach, body, bodyEnd),
                agentConfig: makeAgentConfig({ add }),
            },
        );
        expect(result.error).toBeNull();
        expect(result.scope?.fe).toBe(6);
        expect(callCount).toBe(3);
    });

    test("for-each with accumulator over empty array returns initial value", async () => {
        const forEach = step("fe", {
            type: "for-each",
            params: {
                target: { type: "literal", value: [] },
                itemName: "item",
                loopBodyStepId: "body",
                accumulatorName: "acc",
                accumulatorInitialValue: {
                    type: "literal",
                    value: "init",
                },
            },
        });
        const body = step("body", {
            type: "end",
            params: { output: { type: "jmespath", expression: "item" } },
        });
        const result = await runStep(
            forEach,
            {},
            { workflowDefinition: workflow(forEach, body) },
        );
        expect(result.error).toBeNull();
        expect(result.scope?.fe).toBe("init");
    });

    test("switch-case propagates an error from a branch body step", async () => {
        const callTool = step("callTool", {
            type: "tool-call",
            params: {
                toolName: "missing",
                toolInput: {},
            },
        });
        const switchStep = step("sc", {
            type: "switch-case",
            params: {
                switchOn: { type: "jmespath", expression: "x" },
                cases: [
                    {
                        value: { type: "literal", value: "go" },
                        branchBodyStepId: "callTool",
                    },
                ],
            },
        });
        const result = await runStep(
            switchStep,
            { x: "go" },
            { workflowDefinition: workflow(switchStep, callTool) },
        );
        expect(result.error?.code).toBe("MISSING_TOOL");
    });

    test("while collects each loop body's output into an array", async () => {
        let condCalls = 0;
        let bodyCalls = 0;
        const probe = tool({
            description: "probe",
            inputSchema: type({}),
            outputSchema: type({ go: "boolean" }),
            execute: () => ({ go: ++condCalls <= 3 }),
        });
        const count = tool({
            description: "count",
            inputSchema: type({}),
            outputSchema: type({ n: "number" }),
            execute: () => ({ n: ++bodyCalls }),
        });
        const whileStep = step("wh", {
            type: "while",
            params: { conditionStepId: "cond", loopBodyStepId: "body" },
        });
        const cond = step("cond", {
            type: "tool-call",
            nextStepId: "condEnd",
            params: { toolName: "probe", toolInput: {} },
        });
        const condEnd = step("condEnd", {
            type: "end",
            params: {
                output: { type: "jmespath", expression: "cond.go" },
            },
        });
        const body = step("body", {
            type: "tool-call",
            nextStepId: "bodyEnd",
            params: { toolName: "count", toolInput: {} },
        });
        const bodyEnd = step("bodyEnd", {
            type: "end",
            params: {
                output: { type: "jmespath", expression: "body.n" },
            },
        });
        const result = await runStep(
            whileStep,
            {},
            {
                workflowDefinition: workflow(
                    whileStep,
                    cond,
                    condEnd,
                    body,
                    bodyEnd,
                ),
                agentConfig: makeAgentConfig({ probe, count }),
            },
        );
        expect(result.error).toBeNull();
        expect(result.scope?.wh).toEqual([1, 2, 3]);
    });

    test("while with immediately-false condition produces an empty output", async () => {
        const whileStep = step("wh", {
            type: "while",
            params: { conditionStepId: "cond", loopBodyStepId: "body" },
        });
        const cond = step("cond", {
            type: "end",
            params: { output: { type: "literal", value: false } },
        });
        const body = step("body", {
            type: "end",
            params: { output: { type: "literal", value: 1 } },
        });
        const result = await runStep(
            whileStep,
            {},
            { workflowDefinition: workflow(whileStep, cond, body) },
        );
        expect(result.error).toBeNull();
        expect(result.scope?.wh).toEqual([]);
    });

    test("while propagates an error from a loop body step", async () => {
        const whileStep = step("wh", {
            type: "while",
            params: { conditionStepId: "cond", loopBodyStepId: "body" },
        });
        const cond = step("cond", {
            type: "end",
            params: { output: { type: "literal", value: true } },
        });
        const body = step("body", {
            type: "tool-call",
            params: { toolName: "missing", toolInput: {} },
        });
        const result = await runStep(
            whileStep,
            {},
            { workflowDefinition: workflow(whileStep, cond, body) },
        );
        expect(result.error?.code).toBe("MISSING_TOOL");
    });

    test("while propagates an error from a condition chain step", async () => {
        const whileStep = step("wh", {
            type: "while",
            params: { conditionStepId: "cond", loopBodyStepId: "body" },
        });
        const cond = step("cond", {
            type: "tool-call",
            params: { toolName: "missing", toolInput: {} },
        });
        const body = step("body", {
            type: "end",
            params: { output: { type: "literal", value: 1 } },
        });
        const result = await runStep(
            whileStep,
            {},
            { workflowDefinition: workflow(whileStep, cond, body) },
        );
        expect(result.error?.code).toBe("MISSING_TOOL");
    });

    test("while with accumulator folds iterations", async () => {
        let condCalls = 0;
        let bodyCalls = 0;
        const probe = tool({
            description: "probe",
            inputSchema: type({}),
            outputSchema: type({ go: "boolean" }),
            execute: () => ({ go: ++condCalls <= 3 }),
        });
        const append = tool({
            description: "append",
            inputSchema: type({ acc: "string" }),
            outputSchema: type({ result: "string" }),
            execute: ({ acc }: { acc: string }) => ({
                result: `${acc}${++bodyCalls}`,
            }),
        });
        const whileStep = step("wh", {
            type: "while",
            params: {
                conditionStepId: "cond",
                loopBodyStepId: "body",
                accumulatorName: "acc",
                accumulatorInitialValue: { type: "literal", value: "" },
            },
        });
        const cond = step("cond", {
            type: "tool-call",
            nextStepId: "condEnd",
            params: { toolName: "probe", toolInput: {} },
        });
        const condEnd = step("condEnd", {
            type: "end",
            params: {
                output: { type: "jmespath", expression: "cond.go" },
            },
        });
        const body = step("body", {
            type: "tool-call",
            nextStepId: "bodyEnd",
            params: {
                toolName: "append",
                toolInput: {
                    acc: { type: "jmespath", expression: "acc" },
                },
            },
        });
        const bodyEnd = step("bodyEnd", {
            type: "end",
            params: {
                output: { type: "jmespath", expression: "body.result" },
            },
        });
        const result = await runStep(
            whileStep,
            {},
            {
                workflowDefinition: workflow(
                    whileStep,
                    cond,
                    condEnd,
                    body,
                    bodyEnd,
                ),
                agentConfig: makeAgentConfig({ probe, append }),
            },
        );
        expect(result.error).toBeNull();
        expect(result.scope?.wh).toBe("123");
    });

    test("while with accumulator and immediately-false condition returns initial value", async () => {
        const whileStep = step("wh", {
            type: "while",
            params: {
                conditionStepId: "cond",
                loopBodyStepId: "body",
                accumulatorName: "acc",
                accumulatorInitialValue: { type: "literal", value: 42 },
            },
        });
        const cond = step("cond", {
            type: "end",
            params: { output: { type: "literal", value: false } },
        });
        const body = step("body", {
            type: "end",
            params: { output: { type: "literal", value: 0 } },
        });
        const result = await runStep(
            whileStep,
            {},
            { workflowDefinition: workflow(whileStep, cond, body) },
        );
        expect(result.error).toBeNull();
        expect(result.scope?.wh).toBe(42);
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

    test("rejects a response not in the choices when free response is disabled", async () => {
        const result = await runStep(
            askStep,
            {},
            {
                userInterventionAdapter: {
                    requestIntervention: async () => {},
                    getResponse: async () => ({ answer: "maybe" }),
                },
            },
        );
        expect(result.error?.code).toBe("TYPE_ERROR");
        expect(result.error?.message).toContain(
            "not one of the allowed choices",
        );
    });

    test("accepts a response not in the choices when free response is enabled", async () => {
        const freeAsk = ask({ type: "literal", value: ["yes", "no"] }, true);
        const result = await runStep(
            freeAsk,
            {},
            {
                userInterventionAdapter: {
                    requestIntervention: async () => {},
                    getResponse: async () => ({ answer: "maybe" }),
                },
            },
        );
        expect(result.error).toBeNull();
        expect(result.scope?.ask).toBe("maybe");
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

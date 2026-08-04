import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { tool } from "ai";
import { type } from "arktype";
import type { WorkflowDefinition } from "../schema";
import {
    type AgentConfig,
    type RemoraflowOptions,
    remoraflowOptionsSchema,
    type ToolSet,
} from "../types";
import { validateWorkflowDefinition } from "../validation";
import { step, workflow } from "../workflow-fixtures";
import { executeWorkflow } from "./execute-workflow";
import { runStep } from "./execution-engine/run-step";
import type { ExecutionEngine } from "./execution-engine/types";
import { createMockModel } from "./test-support";
import type {
    InterventionResponse,
    UserInterventionAdapter,
} from "./user-intervention/types";

/**
 * An engine whose delays are recorded and served by moving the clock rather
 * than by waiting, so a test can exercise minute- and hour-scale bounds.
 */
function fastForwardEngine() {
    const sleeps: number[] = [];
    const engine: ExecutionEngine = {
        createRun(procedureId, runId = "run") {
            return {
                getExecutionInfo: () => ({ procedureId, runId }),
                step: (_name, fn, options) => runStep(fn, options),
                sleep: async (seconds) => {
                    sleeps.push(seconds);
                    setSystemTime(new Date(Date.now() + seconds * 1000));
                },
            };
        },
    };
    return { engine, sleeps };
}

const agentConfig: AgentConfig = { tools: {}, model: createMockModel([]) };

function sleepWorkflow(
    durationMs: unknown,
    dynamic = false,
): WorkflowDefinition {
    return workflow(
        step("nap", {
            type: "sleep",
            nextStepId: "fin",
            params: {
                durationMs: dynamic
                    ? // A backtick JSON literal, so the value is real but
                      // reaches the runtime through an expression the
                      // validator cannot read.
                      { type: "jmespath", expression: `\`${durationMs}\`` }
                    : { type: "literal", value: durationMs },
            },
        }),
        step("fin", {
            type: "end",
            params: { output: { type: "literal", value: "awake" } },
        }),
    );
}

async function run(
    workflowDefinition: WorkflowDefinition,
    policy: RemoraflowOptions,
    extras: { userInterventionAdapter?: UserInterventionAdapter } = {},
) {
    const { engine, sleeps } = fastForwardEngine();
    const result = await executeWorkflow({
        workflowDefinition,
        agentConfig,
        executionOptions: {
            policy,
            silenceLogs: true,
            executionEngine: engine,
            ...extras,
        },
    });
    return { result, sleeps };
}

async function runWith(
    workflowDefinition: WorkflowDefinition,
    policy: RemoraflowOptions,
    tools: ToolSet,
) {
    const { engine, sleeps } = fastForwardEngine();
    const result = await executeWorkflow({
        workflowDefinition,
        agentConfig: { tools, model: createMockModel([]) },
        executionOptions: {
            policy,
            silenceLogs: true,
            executionEngine: engine,
        },
    });
    return { result, sleeps };
}

afterEach(() => {
    setSystemTime();
});

/**
 * The bound has to mean the same thing at every layer. A literal is visible to
 * the validator and rejected there; the same value arriving from an expression
 * is invisible to it and has to be caught at execution time instead.
 */
describe("a sleep past maxSleepSeconds", () => {
    const policy: RemoraflowOptions = {
        durationPolicy: { maxSleepSeconds: 60 },
    };
    const overBoundMs = 600_000;

    test("is rejected by standalone validation when authored as a literal", () => {
        const { isValid, diagnostics } = validateWorkflowDefinition(
            sleepWorkflow(overBoundMs),
            { tools: {}, options: remoraflowOptionsSchema.assert(policy) },
        );
        expect(isValid).toBe(false);
        expect(diagnostics.some((d) => d.severity === "error")).toBe(true);
    });

    test("fails the run rather than silently running short", async () => {
        const { result } = await run(sleepWorkflow(overBoundMs), policy);
        expect(result.status).toBe("error");
        expect(result.error?.code).toBe("INVALID_WORKFLOW");
    });

    test("is clamped at execution time when it arrives from an expression", async () => {
        // Invisible to the validator, so the runtime is the only layer that can
        // bound it. Clamping rather than failing keeps a dynamic value from
        // killing a run that is otherwise fine.
        setSystemTime(new Date("2026-01-01T00:00:00Z"));
        const { result, sleeps } = await run(
            sleepWorkflow(overBoundMs, true),
            policy,
        );
        expect(result.status).toBe("success");
        expect(sleeps).toEqual([60]);
    });
});

describe("run-level budgets", () => {
    test("a run that outlives maxDurationSeconds ends with DURATION_LIMIT_EXCEEDED", async () => {
        setSystemTime(new Date("2026-01-01T00:00:00Z"));
        const { result } = await run(
            workflow(
                step("nap", {
                    type: "sleep",
                    nextStepId: "nap2",
                    params: { durationMs: { type: "literal", value: 90_000 } },
                }),
                step("nap2", {
                    type: "sleep",
                    nextStepId: "fin",
                    params: { durationMs: { type: "literal", value: 90_000 } },
                }),
                step("fin", { type: "end" }),
            ),
            { durationPolicy: { maxDurationSeconds: 100 } },
        );
        expect(result.status).toBe("error");
        expect(result.error?.code).toBe("DURATION_LIMIT_EXCEEDED");
        expect(result.error?.message).toContain("maxDurationSeconds");
    });

    test("a later sleep is clamped to what is left of the run", async () => {
        // Two sleeps, so the second is bounded by the remaining wall clock
        // rather than by `maxSleepSeconds`. A single sleep cannot show this:
        // whichever bound is lower produces the same number, and the static one
        // alone would satisfy the assertion.
        setSystemTime(new Date("2026-01-01T00:00:00Z"));
        const { sleeps } = await run(
            workflow(
                step("first", {
                    type: "sleep",
                    nextStepId: "second",
                    params: {
                        durationMs: { type: "jmespath", expression: "`80000`" },
                    },
                }),
                step("second", {
                    type: "sleep",
                    nextStepId: "fin",
                    params: {
                        durationMs: {
                            type: "jmespath",
                            expression: "`150000`",
                        },
                    },
                }),
                step("fin", { type: "end" }),
            ),
            {
                durationPolicy: {
                    maxDurationSeconds: 200,
                    maxSleepSeconds: 150,
                },
            },
        );
        // The second sleep is authored at 150s and allowed 150s by
        // `maxSleepSeconds`, but only 120s of the run remains.
        expect(sleeps).toEqual([80, 120]);
    });
});

describe("an unanswered request-intervention", () => {
    test("is bounded by maxWaitSeconds instead of polling forever", async () => {
        // The step passes no wait options of its own; before the policy reached
        // the context, a supervisor who never answered was polled indefinitely.
        setSystemTime(new Date("2026-01-01T00:00:00Z"));
        const silentAdapter: UserInterventionAdapter = {
            requestIntervention: async () => {},
            // What a poll-based adapter returns while it is still waiting.
            getResponse: async () =>
                undefined as unknown as InterventionResponse,
        };

        const { result } = await run(
            workflow(
                step("ask", {
                    type: "request-intervention",
                    nextStepId: "fin",
                    params: {
                        type: "multiple-choice",
                        question: { type: "literal", value: "Ship it?" },
                        choices: { type: "literal", value: ["yes", "no"] },
                        allowFreeResponse: false,
                    },
                }),
                step("fin", { type: "end" }),
            ),
            {
                allowUserIntervention: true,
                durationPolicy: {
                    maxWaitSeconds: 300,
                    minPollIntervalSeconds: 60,
                },
            },
            { userInterventionAdapter: silentAdapter },
        );

        expect(result.status).toBe("error");
        expect(result.error?.message).toContain("300s");
    });
});

describe("the execution clock", () => {
    /** A tool whose call advances the clock, so steps have real duration. */
    function slowTools(secondsPerCall: number) {
        return {
            slow: tool({
                description: "takes time",
                inputSchema: type({}),
                outputSchema: type({ ready: "boolean" }),
                execute: () => {
                    setSystemTime(new Date(Date.now() + secondsPerCall * 1000));
                    return { ready: true };
                },
            }),
        } satisfies ToolSet;
    }

    test("bills a step inside a poll attempt once, not once per level", async () => {
        // A `waitFor` attempt is itself a step, and the condition chain inside
        // it runs more steps. Charging both bills the same seconds twice and
        // halves the effective budget of any polling run.
        setSystemTime(new Date("2026-01-01T00:00:00Z"));
        const { engine } = fastForwardEngine();
        const result = await executeWorkflow({
            workflowDefinition: workflow(
                step("wait", {
                    type: "wait-for-condition",
                    nextStepId: "after",
                    params: {
                        conditionStepId: "check",
                        condition: {
                            type: "jmespath",
                            expression: "check.ready",
                        },
                        intervalMs: { type: "literal", value: 60_000 },
                    },
                }),
                step("check", {
                    type: "tool-call",
                    params: { toolName: "slow", toolInput: {} },
                }),
                step("after", {
                    type: "tool-call",
                    nextStepId: "fin",
                    params: { toolName: "slow", toolInput: {} },
                }),
                step("fin", { type: "end" }),
            ),
            agentConfig: { tools: slowTools(40), model: createMockModel([]) },
            executionOptions: {
                silenceLogs: true,
                executionEngine: engine,
                policy: {
                    durationPolicy: {
                        maxExecutionSeconds: 100,
                        maxStepExecutionSeconds: 100,
                    },
                },
            },
        });
        // 40s in the poll plus 40s after it is 80s of real work, inside a 100s
        // budget. Billed per level it would be 120s and the run would die.
        expect(result.error).toBeNull();
        expect(result.status).toBe("success");
    });
});

describe("the poll interval floor", () => {
    function pollingWorkflow(backoffMultiplier: number): WorkflowDefinition {
        return workflow(
            step("wait", {
                type: "wait-for-condition",
                nextStepId: "fin",
                params: {
                    conditionStepId: "check",
                    condition: { type: "jmespath", expression: "check.ready" },
                    intervalMs: { type: "literal", value: 60_000 },
                    maxAttempts: { type: "literal", value: 4 },
                    backoffMultiplier: {
                        type: "jmespath",
                        expression: `\`${backoffMultiplier}\``,
                    },
                },
            }),
            step("check", {
                type: "tool-call",
                params: { toolName: "probe", toolInput: {} },
            }),
            step("fin", { type: "end" }),
        );
    }

    /** A condition that never comes true, so every attempt is used. */
    const neverReady = {
        probe: tool({
            description: "never ready",
            inputSchema: type({}),
            outputSchema: type({ ready: "boolean" }),
            execute: () => ({ ready: false }),
        }),
    } satisfies ToolSet;

    test.each([
        ["a multiplier below 1", 0],
        ["a NaN multiplier", Number.NaN],
    ])("holds under %s", async (_label, backoffMultiplier) => {
        // The floor is applied once before the loop, so multiplying the
        // interval in place can walk it under the bound and busy-poll.
        setSystemTime(new Date("2026-01-01T00:00:00Z"));
        const { engine, sleeps } = fastForwardEngine();
        await executeWorkflow({
            workflowDefinition: pollingWorkflow(backoffMultiplier),
            agentConfig: { tools: neverReady, model: createMockModel([]) },
            executionOptions: {
                silenceLogs: true,
                executionEngine: engine,
                policy: {
                    durationPolicy: {
                        minPollIntervalSeconds: 60,
                        maxWaitSeconds: 86_400,
                    },
                },
            },
        });
        // Asserting the whole sequence, not `every(>= 60)`: a zero-length
        // sleep never reaches `run.sleep`, so it leaves no entry and a
        // predicate over the recorded entries passes vacuously.
        expect(sleeps).toEqual([60, 60, 60]);
    });
});

describe("a step bound beyond the timer range", () => {
    test("runs untimed instead of being killed immediately", async () => {
        // Delays past ~24.85 days overflow a 32-bit millisecond value and fire
        // on the next tick, so a huge bound must skip the timer rather than
        // become an instant timeout.
        const tools = {
            add: tool({
                description: "adds, slowly enough to lose a 1ms race",
                inputSchema: type({}),
                outputSchema: type("number"),
                execute: async () => {
                    await Bun.sleep(25);
                    return 1;
                },
            }),
        } satisfies ToolSet;
        const { result } = await runWith(
            workflow(
                step("call", {
                    type: "tool-call",
                    nextStepId: "fin",
                    params: { toolName: "add", toolInput: {} },
                }),
                step("fin", { type: "end" }),
            ),
            {
                durationPolicy: {
                    maxExecutionSeconds: 30 * 86_400,
                    maxStepExecutionSeconds: 30 * 86_400,
                },
            },
            tools,
        );
        expect(result.error).toBeNull();
        expect(result.status).toBe("success");
    });
});

describe("a run budget that cuts a step short", () => {
    /** A tool that hangs, so only a timeout can end the step. */
    const hangingTools = {
        hang: tool({
            description: "never settles in time",
            inputSchema: type({}),
            outputSchema: type("number"),
            execute: async () => {
                await Bun.sleep(5_000);
                return 1;
            },
        }),
    } satisfies ToolSet;

    const callHang = workflow(
        step("call", {
            type: "tool-call",
            nextStepId: "fin",
            params: { toolName: "hang", toolInput: {} },
        }),
        step("fin", { type: "end" }),
    );

    test("is reported as DURATION_LIMIT_EXCEEDED, not as a tool failure", async () => {
        // The executor wraps anything the step throws as TOOL_ERROR. A run that
        // ran out of budget must not be disguised as a broken tool.
        const { result } = await runWith(
            callHang,
            {
                durationPolicy: {
                    maxExecutionSeconds: 0.05,
                    maxStepExecutionSeconds: 3_600,
                },
            },
            hangingTools,
        );
        expect(result.error?.code).toBe("DURATION_LIMIT_EXCEEDED");
        expect(result.error?.message).toContain("maxExecutionSeconds");
    });

    test("a step that outlives its own bound is still a step failure", async () => {
        // The mirror case: when the step's own limit is what binds, the run has
        // budget left and the executor's own error code is the right one.
        const { result } = await runWith(
            callHang,
            {
                durationPolicy: {
                    maxExecutionSeconds: 3_600,
                    maxStepExecutionSeconds: 0.05,
                },
            },
            hangingTools,
        );
        expect(result.error?.code).toBe("TOOL_ERROR");
        expect(result.error?.message).toContain("timed out");
    });
});

describe("an unrelated failure", () => {
    test("is not relabelled as a duration limit", async () => {
        const { result } = await runWith(
            workflow(
                step("call", {
                    type: "tool-call",
                    nextStepId: "fin",
                    params: { toolName: "boom", toolInput: {} },
                }),
                step("fin", { type: "end" }),
            ),
            {},
            {
                boom: tool({
                    description: "throws",
                    inputSchema: type({}),
                    outputSchema: type("number"),
                    execute: async () => {
                        throw new Error("kaboom");
                    },
                }),
            } satisfies ToolSet,
        );
        expect(result.error?.code).toBe("TOOL_ERROR");
        expect(result.error?.message).toContain("kaboom");
    });
});

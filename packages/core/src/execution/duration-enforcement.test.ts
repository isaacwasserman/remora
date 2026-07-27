import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import type { WorkflowDefinition } from "../schema";
import {
    type AgentConfig,
    type RemoraflowOptions,
    remoraflowOptionsSchema,
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
        procedureId: "duration",
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

    test("a sleep is clamped to what is left of the run", async () => {
        // Sleeping the full authored duration would overshoot a deadline the
        // run has already lost.
        setSystemTime(new Date("2026-01-01T00:00:00Z"));
        const { sleeps } = await run(sleepWorkflow(900_000, true), {
            durationPolicy: { maxDurationSeconds: 120, maxSleepSeconds: 900 },
        });
        expect(sleeps).toEqual([120]);
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

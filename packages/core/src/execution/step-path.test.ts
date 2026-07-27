import { describe, expect, test } from "bun:test";
import { tool } from "ai";
import { type } from "arktype";
import type { WorkflowDefinition } from "../schema";
import type { AgentConfig, ToolSet } from "../types";
import { step, workflow } from "../workflow-fixtures";
import { _executeWorkflow } from "./execute-workflow";
import { createExecutionContext } from "./execution-engine/context";
import { createDurableExecutionEngine } from "./execution-engine/durable-execution";
import { createInMemoryCheckpointAdapter } from "./execution-engine/durable-execution/in-memory-adapter";
import { createInMemoryExecutionEngine } from "./execution-engine/in-memory";
import { createMockModel } from "./test-support";
import type { ResolvedExecutionOptions, StepExecutionUpdate } from "./types";
import { defaultUserInterventionAdapter } from "./user-intervention/default-adapter";
import { createUserInverventionContext } from "./user-intervention/types";

/**
 * Step keys come from each step's `StepPath` alone — never from
 * execution order — so these tests assert on the exact keys written to the
 * store, and on the tool-call counts that prove no two operations collided (a
 * collision silently replays a cached result instead of re-running).
 *
 * Validation is bypassed (`_executeWorkflow`) to keep these focused on keying.
 */

/** Tools that count their calls, plus a probe that turns ready on call `readyOn`. */
function countingToolset(readyOn = 1) {
    const counts = { probe: 0, echo: 0 };
    const tools = {
        probe: tool({
            description: "ready once called enough times",
            inputSchema: type({}),
            outputSchema: type({ ready: "boolean" }),
            execute: () => ({ ready: ++counts.probe >= readyOn }),
        }),
        echo: tool({
            description: "echoes its input",
            inputSchema: type({ v: "unknown" }),
            outputSchema: type({ v: "unknown" }),
            execute: ({ v }) => {
                counts.echo++;
                return { v };
            },
        }),
    } satisfies ToolSet;
    return { tools, counts };
}

function makeOptions(): ResolvedExecutionOptions {
    return {
        silenceLogs: true,
        maxSleepSeconds: 0,
        maxLLMPromptTokens: 128_000,
        executionEngine: createInMemoryExecutionEngine(),
        userInterventionAdapter: defaultUserInterventionAdapter,
    };
}

async function runCapturingStepKeys(
    workflowDefinition: WorkflowDefinition,
    tools: ToolSet,
) {
    const backing = createInMemoryCheckpointAdapter();
    const stepKeys: string[] = [];
    const store = {
        load: (runId: string, key: string) => backing.load(runId, key),
        save: (runId: string, key: string, value: unknown) => {
            if (key.endsWith(":result")) {
                stepKeys.push(key.slice(0, -":result".length));
            }
            return backing.save(runId, key, value);
        },
    };

    const agentConfig: AgentConfig = { tools, model: createMockModel([]) };

    let last: StepExecutionUpdate | undefined;
    for await (const update of _executeWorkflow({
        workflowDefinition,
        initialScope: {},
        agentConfig,
        executionContext: createExecutionContext(
            createDurableExecutionEngine(store).createRun("p", "r"),
        ),
        userInterventionContext: createUserInverventionContext(
            defaultUserInterventionAdapter,
        ),
        executionOptions: makeOptions(),
        uniqueStepIdPath: [],
    })) {
        if (update.error) throw new Error(update.error.message);
        last = update;
    }
    return { stepKeys, output: last?.output, scope: last?.scope };
}

describe("step paths", () => {
    test("each loop iteration keys its body by iteration index", async () => {
        const { tools, counts } = countingToolset();
        const { stepKeys } = await runCapturingStepKeys(
            workflow(
                step("loop", {
                    type: "for-each",
                    params: {
                        target: { type: "literal", value: [1, 2, 3] },
                        itemName: "i",
                        loopBodyStepId: "body",
                    },
                }),
                step("body", {
                    type: "tool-call",
                    params: {
                        toolName: "echo",
                        toolInput: { v: { type: "jmespath", expression: "i" } },
                    },
                }),
            ),
            tools,
        );
        expect(stepKeys).toEqual(["loop.0.body", "loop.1.body", "loop.2.body"]);
        expect(counts.echo).toBe(3);
    });

    test("two sibling wait steps do not share checkpoints", async () => {
        // Both waits used to emit `waitFor:eval:<n>`, distinguished only by a
        // positional counter; keyed by step path they are distinct by name.
        const { tools, counts } = countingToolset(2);
        const { stepKeys } = await runCapturingStepKeys(
            workflow(
                step("wait1", {
                    type: "wait-for-condition",
                    nextStepId: "wait2",
                    params: {
                        conditionStepId: "checkA",
                        condition: {
                            type: "jmespath",
                            expression: "checkA.ready",
                        },
                        intervalMs: { type: "literal", value: 0 },
                        maxAttempts: { type: "literal", value: 4 },
                    },
                }),
                step("checkA", {
                    type: "tool-call",
                    params: { toolName: "probe", toolInput: {} },
                }),
                step("wait2", {
                    type: "wait-for-condition",
                    params: {
                        conditionStepId: "checkB",
                        condition: {
                            type: "jmespath",
                            expression: "checkB.ready",
                        },
                        intervalMs: { type: "literal", value: 0 },
                        maxAttempts: { type: "literal", value: 4 },
                    },
                }),
                step("checkB", {
                    type: "tool-call",
                    params: { toolName: "probe", toolInput: {} },
                }),
            ),
            tools,
        );
        expect(stepKeys).toEqual([
            "wait1.attempt.0.checkA",
            "wait1.attempt.0",
            "wait1.attempt.1.wake-at",
            "wait1.attempt.1.checkA",
            "wait1.attempt.1",
            "wait2.attempt.0.checkB",
            "wait2.attempt.0",
        ]);
        // wait1 polls twice before the shared probe reports ready, wait2 once.
        // A shared checkpoint would let wait2 replay wait1's recorded condition
        // value, leaving the probe on 2.
        expect(counts.probe).toBe(3);
    });

    test("a condition chain re-runs on every poll attempt", async () => {
        const { tools, counts } = countingToolset(3);
        const { stepKeys, scope } = await runCapturingStepKeys(
            workflow(
                step("wait", {
                    type: "wait-for-condition",
                    params: {
                        conditionStepId: "check",
                        condition: {
                            type: "jmespath",
                            expression: "check.ready",
                        },
                        intervalMs: { type: "literal", value: 0 },
                        maxAttempts: { type: "literal", value: 5 },
                    },
                }),
                step("check", {
                    type: "tool-call",
                    params: { toolName: "probe", toolInput: {} },
                }),
            ),
            tools,
        );
        expect(counts.probe).toBe(3);
        expect(scope?.wait).toBe(true);
        // The attempt number is part of the path, so the chain is not replayed.
        expect(stepKeys).toEqual([
            "wait.attempt.0.check",
            "wait.attempt.0",
            "wait.attempt.1.wake-at",
            "wait.attempt.1.check",
            "wait.attempt.1",
            "wait.attempt.2.wake-at",
            "wait.attempt.2.check",
            "wait.attempt.2",
        ]);
    });

    test("every nested block execution does its own work rather than aliasing a sibling", async () => {
        // The adapter keys steps by name alone, so a block step that fails to
        // append a distinguishing segment — or appends a constant one — would
        // silently replay a sibling's recorded result instead of executing.
        // Neither is expressible as a type, so it is enforced here: any step type
        // added to `nestedChains` in `utils.ts` should join this workflow.
        const { tools, counts } = countingToolset(2);
        const { stepKeys } = await runCapturingStepKeys(
            // for-each ▸ switch-case ▸ wait-for-condition ▸ for-each,
            // so every block type nests inside another.
            workflow(
                step("outer", {
                    type: "for-each",
                    nextStepId: "done",
                    params: {
                        target: { type: "literal", value: [1, 2] },
                        itemName: "i",
                        loopBodyStepId: "route",
                    },
                }),
                step("route", {
                    type: "switch-case",
                    params: {
                        switchOn: { type: "jmespath", expression: "i" },
                        cases: [
                            {
                                value: { type: "literal", value: 1 },
                                branchBodyStepId: "waitBranch",
                            },
                            {
                                value: { type: "default" },
                                branchBodyStepId: "echoBranch",
                            },
                        ],
                    },
                }),
                step("waitBranch", {
                    type: "wait-for-condition",
                    params: {
                        conditionStepId: "innerLoop",
                        condition: {
                            type: "jmespath",
                            expression: "probeStep.ready",
                        },
                        intervalMs: { type: "literal", value: 0 },
                        maxAttempts: { type: "literal", value: 5 },
                    },
                }),
                step("innerLoop", {
                    type: "for-each",
                    nextStepId: "probeStep",
                    params: {
                        target: { type: "literal", value: [10, 20] },
                        itemName: "j",
                        loopBodyStepId: "innerBody",
                    },
                }),
                step("innerBody", {
                    type: "tool-call",
                    params: {
                        toolName: "echo",
                        toolInput: { v: { type: "jmespath", expression: "j" } },
                    },
                }),
                step("probeStep", {
                    type: "tool-call",
                    params: { toolName: "probe", toolInput: {} },
                }),
                step("echoBranch", {
                    type: "tool-call",
                    params: {
                        toolName: "echo",
                        toolInput: { v: { type: "jmespath", expression: "i" } },
                    },
                }),
                step("done", {
                    type: "end",
                    params: {
                        output: { type: "jmespath", expression: "outer" },
                    },
                }),
            ),
            tools,
        );

        // Counted work, not key uniqueness, is what detects aliasing: a colliding
        // key short-circuits to the recorded result and never writes again, so a
        // duplicate key never appears — the work simply goes missing.
        //
        // i=1 takes the wait branch: 2 poll attempts, each running the inner loop
        // over 2 items (4 echo) then the probe (2 probe). i=2 takes the echo
        // branch (1 echo).
        expect(counts.echo).toBe(5);
        expect(counts.probe).toBe(2);
        expect(stepKeys).toEqual([
            "outer.0.route.0.waitBranch.attempt.0.innerLoop.0.innerBody",
            "outer.0.route.0.waitBranch.attempt.0.innerLoop.1.innerBody",
            "outer.0.route.0.waitBranch.attempt.0.probeStep",
            "outer.0.route.0.waitBranch.attempt.0",
            "outer.0.route.0.waitBranch.attempt.1.wake-at",
            "outer.0.route.0.waitBranch.attempt.1.innerLoop.0.innerBody",
            "outer.0.route.0.waitBranch.attempt.1.innerLoop.1.innerBody",
            "outer.0.route.0.waitBranch.attempt.1.probeStep",
            "outer.0.route.0.waitBranch.attempt.1",
            "outer.1.route.1.echoBranch",
        ]);
    });

    test("keys are stable regardless of how much ran before them", async () => {
        // Same wait step, once alone and once after a loop. Positional keying
        // shifted the wait's key; path keying does not.
        const build = (withLoop: boolean): WorkflowDefinition =>
            workflow(
                ...(withLoop
                    ? [
                          step("loop", {
                              type: "for-each",
                              nextStepId: "wait",
                              params: {
                                  target: { type: "literal", value: [1, 2] },
                                  itemName: "i",
                                  loopBodyStepId: "body",
                              },
                          }),
                          step("body", {
                              type: "tool-call",
                              params: {
                                  toolName: "echo",
                                  toolInput: {
                                      v: { type: "jmespath", expression: "i" },
                                  },
                              },
                          }),
                      ]
                    : []),
                step("wait", {
                    type: "wait-for-condition",
                    params: {
                        conditionStepId: "check",
                        condition: {
                            type: "jmespath",
                            expression: "check.ready",
                        },
                        intervalMs: { type: "literal", value: 0 },
                    },
                }),
                step("check", {
                    type: "tool-call",
                    params: { toolName: "probe", toolInput: {} },
                }),
            );

        const alone = await runCapturingStepKeys(
            build(false),
            countingToolset().tools,
        );
        const afterLoop = await runCapturingStepKeys(
            build(true),
            countingToolset().tools,
        );
        const waitKeys = (keys: string[]) =>
            keys.filter((key) => key.startsWith("wait"));
        expect(waitKeys(alone.stepKeys)).toEqual([
            "wait.attempt.0.check",
            "wait.attempt.0",
        ]);
        expect(waitKeys(afterLoop.stepKeys)).toEqual(waitKeys(alone.stepKeys));
    });
});

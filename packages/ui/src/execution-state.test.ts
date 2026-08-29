import { expect, test } from "bun:test";
import type { ExecutionState, StepExecutionRecord } from "@remoraflow/core";
import {
    derivePathSequenceIndexes,
    deriveStepSummaries,
} from "./execution-state";

function record(
    stepId: string,
    iteration: number,
    output: unknown,
): StepExecutionRecord {
    return {
        executionId: JSON.stringify(["loop", String(iteration), stepId]),
        invocationPath: ["loop", String(iteration), stepId],
        stepId,
        status: "completed",
        renderedParams: { item: iteration },
        output,
        error: null,
        state: undefined,
    };
}

test("keeps every loop invocation under its authored step", () => {
    const state = {
        status: "success",
        output: null,
        error: null,
        logs: [],
        scope: {},
        executionPath: [],
        stepExecutions: [
            record("assess_matchup", 0, { threat: "A" }),
            record("assess_matchup", 1, { threat: "B" }),
        ],
    } as ExecutionState;

    const summary = deriveStepSummaries(state).get("assess_matchup");
    expect(summary?.executionCount).toBe(2);
    expect(summary?.executions.map((entry) => entry.output)).toEqual([
        { threat: "A" },
        { threat: "B" },
    ]);
});

test("keeps output-less completed steps completed", () => {
    const state = {
        status: "success",
        output: null,
        error: null,
        logs: [],
        scope: {},
        executionPath: [],
        stepExecutions: [record("rate_limit", 0, undefined)],
    } as ExecutionState;

    expect(deriveStepSummaries(state).get("rate_limit")?.status).toBe(
        "completed",
    );
});

test("indexes repeated steps across a hovered execution trace", () => {
    const executions = [
        record("start", 0, null),
        record("fetch", 0, null),
        record("assess_matchup", 0, { score: 1 }),
        record("rate_limit", 0, null),
        record("assess_matchup", 1, { score: 2 }),
    ];
    const state = {
        status: "success",
        output: null,
        error: null,
        logs: [],
        scope: {},
        executionPath: [],
        stepExecutions: executions,
    } as ExecutionState;

    const indexes = derivePathSequenceIndexes(
        state,
        executions[4]?.executionId,
    );

    expect(indexes.get("assess_matchup")).toEqual([3, 5]);
    expect(indexes.get("rate_limit")).toEqual([4]);
    expect(indexes.has("unvisited")).toBe(false);
});

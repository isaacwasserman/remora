import { describe, expect, test } from "bun:test";
import type { ExecutionState } from "@remoraflow/core";
import { deriveStepSummaries } from "./execution-state";

function makeState(overrides: Partial<ExecutionState> = {}): ExecutionState {
  return {
    runId: "run-1",
    status: "completed",
    startedAt: "t0",
    stepRecords: [],
    ...overrides,
  };
}

describe("deriveStepSummaries", () => {
  test("returns empty map for no records", () => {
    const result = deriveStepSummaries(makeState());
    expect(result.size).toBe(0);
  });

  test("single completed step", () => {
    const result = deriveStepSummaries(
      makeState({
        stepRecords: [
          {
            stepId: "s1",
            status: "completed",
            startedAt: "t1",
            completedAt: "t2",
            durationMs: 100,
            output: { result: "ok" },
            retries: [],
            path: [],
          },
        ],
      }),
    );
    expect(result.size).toBe(1);
    const s = result.get("s1");
    expect(s?.status).toBe("completed");
    expect(s?.executionCount).toBe(1);
    expect(s?.completedCount).toBe(1);
    expect(s?.failedCount).toBe(0);
    expect(s?.latestOutput).toEqual({ result: "ok" });
    expect(s?.latestDurationMs).toBe(100);
  });

  test("filters to latest iteration for loop-body steps", () => {
    const result = deriveStepSummaries(
      makeState({
        stepRecords: [
          {
            stepId: "s1",
            status: "completed",
            startedAt: "t1",
            completedAt: "t2",
            durationMs: 10,
            output: "first",
            retries: [],
            path: [
              {
                type: "for-each",
                stepId: "loop",
                iterationIndex: 0,
                itemValue: "a",
              },
            ],
          },
          {
            stepId: "s1",
            status: "failed",
            startedAt: "t5",
            completedAt: "t6",
            durationMs: 5,
            error: {
              code: "ERR",
              category: "external",
              message: "boom",
            },
            retries: [],
            path: [
              {
                type: "for-each",
                stepId: "loop",
                iterationIndex: 1,
                itemValue: "b",
              },
            ],
          },
        ],
      }),
    );

    const s = result.get("s1");
    // Only latest iteration (1) is shown
    expect(s?.executionCount).toBe(1);
    expect(s?.completedCount).toBe(0);
    expect(s?.failedCount).toBe(1);
    expect(s?.status).toBe("failed");
    expect(s?.latestError?.code).toBe("ERR");
  });

  test("excludes steps that only ran in previous iterations", () => {
    // Simulates a switch-case inside a for-each:
    // iteration 0: branch_a runs, branch_b does not
    // iteration 1: branch_b runs, branch_a does not
    const result = deriveStepSummaries(
      makeState({
        stepRecords: [
          {
            stepId: "branch_a",
            status: "completed",
            startedAt: "t1",
            completedAt: "t2",
            durationMs: 10,
            output: "done-a",
            retries: [],
            path: [
              {
                type: "for-each",
                stepId: "loop",
                iterationIndex: 0,
                itemValue: "x",
              },
            ],
          },
          {
            stepId: "branch_b",
            status: "completed",
            startedAt: "t3",
            completedAt: "t4",
            durationMs: 10,
            output: "done-b",
            retries: [],
            path: [
              {
                type: "for-each",
                stepId: "loop",
                iterationIndex: 1,
                itemValue: "y",
              },
            ],
          },
        ],
      }),
    );

    // branch_a only ran in iteration 0 (not latest) → excluded
    expect(result.has("branch_a")).toBe(false);
    // branch_b ran in iteration 1 (latest) → included
    expect(result.get("branch_b")?.status).toBe("completed");
  });

  test("retries are aggregated across executions", () => {
    const result = deriveStepSummaries(
      makeState({
        stepRecords: [
          {
            stepId: "s1",
            status: "completed",
            startedAt: "t1",
            completedAt: "t2",
            durationMs: 50,
            output: "ok",
            retries: [
              {
                attempt: 1,
                startedAt: "t1",
                failedAt: "t1.5",
                errorCode: "ERR",
                errorMessage: "fail1",
              },
              {
                attempt: 2,
                startedAt: "t1.5",
                failedAt: "t1.8",
                errorCode: "ERR",
                errorMessage: "fail2",
              },
            ],
            path: [],
          },
        ],
      }),
    );

    const s = result.get("s1");
    expect(s?.totalRetries).toBe(2);
  });

  test("latest iteration shows running while previous is filtered out", () => {
    const result = deriveStepSummaries(
      makeState({
        stepRecords: [
          {
            stepId: "s1",
            status: "completed",
            startedAt: "t1",
            completedAt: "t2",
            durationMs: 10,
            retries: [],
            path: [
              {
                type: "for-each",
                stepId: "loop",
                iterationIndex: 0,
                itemValue: 0,
              },
            ],
          },
          {
            stepId: "s1",
            status: "running",
            startedAt: "t3",
            retries: [],
            path: [
              {
                type: "for-each",
                stepId: "loop",
                iterationIndex: 1,
                itemValue: 1,
              },
            ],
          },
        ],
      }),
    );
    // Only latest iteration (1) is shown
    expect(result.get("s1")?.status).toBe("running");
    expect(result.get("s1")?.executionCount).toBe(1);
  });

  test("multiple distinct steps", () => {
    const result = deriveStepSummaries(
      makeState({
        stepRecords: [
          {
            stepId: "s1",
            status: "completed",
            startedAt: "t1",
            completedAt: "t2",
            durationMs: 10,
            retries: [],
            path: [],
          },
          {
            stepId: "s2",
            status: "running",
            startedAt: "t3",
            retries: [],
            path: [],
          },
        ],
      }),
    );
    expect(result.size).toBe(2);
    expect(result.get("s1")?.status).toBe("completed");
    expect(result.get("s2")?.status).toBe("running");
  });
});

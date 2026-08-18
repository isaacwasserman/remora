import { describe, expect, test } from "bun:test";
import type { ExecutionState } from "@remoraflow/core";
import { deriveStepSummaries } from "./execution-state";

function makeState(overrides: Partial<ExecutionState> = {}): ExecutionState {
    return {
        status: "success",
        output: null,
        error: null,
        logs: [],
        scope: {},
        executionPath: [],
        ...overrides,
    } as ExecutionState;
}

describe("deriveStepSummaries", () => {
    test("returns empty map when executionPath is empty", () => {
        const result = deriveStepSummaries(makeState());
        expect(result.size).toBe(0);
    });

    test("single completed step", () => {
        const result = deriveStepSummaries(
            makeState({
                status: "success",
                executionPath: [["s1"]],
                scope: { s1: { result: "ok" } },
            }),
        );
        expect(result.size).toBe(1);
        const s = result.get("s1");
        expect(s?.status).toBe("completed");
        expect(s?.executionCount).toBe(1);
        expect(s?.latestOutput).toEqual({ result: "ok" });
    });

    test("step is running when it is the last leaf and status is not terminal", () => {
        const result = deriveStepSummaries(
            makeState({
                status: "in-progress",
                executionPath: [["s1"], ["s2"]],
                scope: { s1: "done" },
            }),
        );
        expect(result.get("s1")?.status).toBe("completed");
        expect(result.get("s2")?.status).toBe("running");
    });

    test("step is failed when it is the last leaf, status is error, and not in scope", () => {
        const result = deriveStepSummaries(
            makeState({
                status: "error",
                output: null,
                error: { code: "TOOL_ERROR", message: "tool broke" },
                executionPath: [["s1"], ["s2"]],
                scope: { s1: "done" },
            }),
        );
        expect(result.get("s1")?.status).toBe("completed");
        const s2 = result.get("s2");
        expect(s2?.status).toBe("failed");
        expect(s2?.latestError).toEqual({
            code: "TOOL_ERROR",
            message: "tool broke",
        });
    });

    test("counts executions by occurrence in executionPath", () => {
        const result = deriveStepSummaries(
            makeState({
                status: "success",
                executionPath: [["loop", "s1"], ["loop", "s1"], ["loop", "s1"]],
                scope: { s1: "final" },
            }),
        );
        const s = result.get("s1");
        expect(s?.executionCount).toBe(3);
        expect(s?.status).toBe("completed");
        expect(s?.latestOutput).toBe("final");
    });

    test("extracts step ID from the last segment of each path", () => {
        const result = deriveStepSummaries(
            makeState({
                status: "success",
                executionPath: [["parent", "child"]],
                scope: { child: 42 },
            }),
        );
        expect(result.has("child")).toBe(true);
        expect(result.get("child")?.latestOutput).toBe(42);
    });

    test("multiple distinct steps", () => {
        const result = deriveStepSummaries(
            makeState({
                status: "success",
                executionPath: [["s1"], ["s2"]],
                scope: { s1: "a", s2: "b" },
            }),
        );
        expect(result.size).toBe(2);
        expect(result.get("s1")?.status).toBe("completed");
        expect(result.get("s2")?.status).toBe("completed");
    });

    test("step not in scope and not last is pending", () => {
        const result = deriveStepSummaries(
            makeState({
                status: "success",
                executionPath: [["s1"], ["s2"], ["s3"]],
                scope: { s1: "a", s3: "c" },
            }),
        );
        expect(result.get("s2")?.status).toBe("pending");
    });
});

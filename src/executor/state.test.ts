import { describe, expect, test } from "bun:test";
import { ExternalServiceError, ValidationError } from "./errors";
import type { ExecutionDelta, ExecutionState } from "./state";
import { applyDelta, snapshotError } from "./state";

// ─── snapshotError ──────────────────────────────────────────────

describe("snapshotError", () => {
	test("captures core fields", () => {
		const err = new ValidationError(
			"step-1",
			"TOOL_INPUT_VALIDATION_FAILED",
			"bad input",
			{},
		);
		const snap = snapshotError(err);
		expect(snap.code).toBe("TOOL_INPUT_VALIDATION_FAILED");
		expect(snap.category).toBe("validation");
		expect(snap.message).toBe("bad input");
		expect(snap.stepId).toBe("step-1");
	});

	test("captures statusCode from ExternalServiceError", () => {
		const err = new ExternalServiceError(
			"step-2",
			"LLM_API_ERROR",
			"timeout",
			undefined,
			503,
			true,
		);
		const snap = snapshotError(err);
		expect(snap.statusCode).toBe(503);
		expect(snap.isRetryable).toBe(true);
	});

	test("omits optional fields when not present", () => {
		const err = new ExternalServiceError(
			"step-3",
			"TOOL_EXECUTION_FAILED",
			"oops",
		);
		const snap = snapshotError(err);
		expect(snap.stepId).toBe("step-3");
		expect(snap.statusCode).toBeUndefined();
	});
});

// ─── applyDelta ─────────────────────────────────────────────────

function makeEmptyState(runId = "run-1"): ExecutionState {
	return {
		runId,
		status: "pending",
		startedAt: "",
		stepRecords: [],
	};
}

describe("applyDelta", () => {
	test("run-started sets status and startedAt", () => {
		const state = makeEmptyState();
		const result = applyDelta(state, {
			type: "run-started",
			runId: "run-1",
			startedAt: "2025-01-01T00:00:00Z",
		});
		expect(result.status).toBe("running");
		expect(result.startedAt).toBe("2025-01-01T00:00:00Z");
	});

	test("step-started adds a step record", () => {
		const state = applyDelta(makeEmptyState(), {
			type: "run-started",
			runId: "run-1",
			startedAt: "2025-01-01T00:00:00Z",
		});
		const result = applyDelta(state, {
			type: "step-started",
			stepId: "step-1",
			path: [],
			startedAt: "2025-01-01T00:00:01Z",
		});
		expect(result.stepRecords).toHaveLength(1);
		expect(result.stepRecords[0]?.stepId).toBe("step-1");
		expect(result.stepRecords[0]?.status).toBe("running");
	});

	test("step-completed updates matching record", () => {
		let state = makeEmptyState();
		state = applyDelta(state, {
			type: "run-started",
			runId: "run-1",
			startedAt: "t0",
		});
		state = applyDelta(state, {
			type: "step-started",
			stepId: "s1",
			path: [],
			startedAt: "t1",
		});
		state = applyDelta(state, {
			type: "step-completed",
			stepId: "s1",
			path: [],
			completedAt: "t2",
			durationMs: 100,
			output: { result: "ok" },
		});
		expect(state.stepRecords[0]?.status).toBe("completed");
		expect(state.stepRecords[0]?.durationMs).toBe(100);
		expect(state.stepRecords[0]?.output).toEqual({ result: "ok" });
	});

	test("step-failed updates matching record", () => {
		let state = makeEmptyState();
		state = applyDelta(state, {
			type: "run-started",
			runId: "run-1",
			startedAt: "t0",
		});
		state = applyDelta(state, {
			type: "step-started",
			stepId: "s1",
			path: [],
			startedAt: "t1",
		});
		state = applyDelta(state, {
			type: "step-failed",
			stepId: "s1",
			path: [],
			failedAt: "t2",
			durationMs: 50,
			error: {
				code: "VALIDATION_ERROR",
				category: "validation",
				message: "bad",
			},
		});
		expect(state.stepRecords[0]?.status).toBe("failed");
		expect(state.stepRecords[0]?.error?.code).toBe("VALIDATION_ERROR");
	});

	test("step-retry appends to retries", () => {
		let state = makeEmptyState();
		state = applyDelta(state, {
			type: "run-started",
			runId: "run-1",
			startedAt: "t0",
		});
		state = applyDelta(state, {
			type: "step-started",
			stepId: "s1",
			path: [],
			startedAt: "t1",
		});
		state = applyDelta(state, {
			type: "step-retry",
			stepId: "s1",
			path: [],
			retry: {
				attempt: 1,
				startedAt: "t1",
				failedAt: "t2",
				errorCode: "EXTERNAL_SERVICE_ERROR",
				errorMessage: "timeout",
			},
		});
		expect(state.stepRecords[0]?.retries).toHaveLength(1);
		expect(state.stepRecords[0]?.retries[0]?.attempt).toBe(1);
	});

	test("run-completed finalizes state", () => {
		let state = makeEmptyState();
		state = applyDelta(state, {
			type: "run-started",
			runId: "run-1",
			startedAt: "t0",
		});
		state = applyDelta(state, {
			type: "run-completed",
			runId: "run-1",
			completedAt: "t10",
			durationMs: 1000,
			output: { final: true },
		});
		expect(state.status).toBe("completed");
		expect(state.completedAt).toBe("t10");
		expect(state.durationMs).toBe(1000);
		expect(state.output).toEqual({ final: true });
	});

	test("run-failed finalizes state with error", () => {
		let state = makeEmptyState();
		state = applyDelta(state, {
			type: "run-started",
			runId: "run-1",
			startedAt: "t0",
		});
		state = applyDelta(state, {
			type: "run-failed",
			runId: "run-1",
			failedAt: "t5",
			durationMs: 500,
			error: {
				code: "EXPRESSION_ERROR",
				category: "expression",
				message: "bad expr",
			},
		});
		expect(state.status).toBe("failed");
		expect(state.error?.code).toBe("EXPRESSION_ERROR");
	});

	test("full lifecycle with for-each path segments", () => {
		const deltas: ExecutionDelta[] = [
			{ type: "run-started", runId: "r1", startedAt: "t0" },
			{ type: "step-started", stepId: "s1", path: [], startedAt: "t1" },
			{
				type: "step-completed",
				stepId: "s1",
				path: [],
				completedAt: "t2",
				durationMs: 10,
				output: { items: [1, 2] },
			},
			{
				type: "step-started",
				stepId: "s2",
				path: [
					{
						type: "for-each",
						stepId: "s1",
						iterationIndex: 0,
						itemValue: 1,
					},
				],
				startedAt: "t3",
			},
			{
				type: "step-completed",
				stepId: "s2",
				path: [
					{
						type: "for-each",
						stepId: "s1",
						iterationIndex: 0,
						itemValue: 1,
					},
				],
				completedAt: "t4",
				durationMs: 5,
				output: "done-0",
			},
			{
				type: "step-started",
				stepId: "s2",
				path: [
					{
						type: "for-each",
						stepId: "s1",
						iterationIndex: 1,
						itemValue: 2,
					},
				],
				startedAt: "t5",
			},
			{
				type: "step-completed",
				stepId: "s2",
				path: [
					{
						type: "for-each",
						stepId: "s1",
						iterationIndex: 1,
						itemValue: 2,
					},
				],
				completedAt: "t6",
				durationMs: 5,
				output: "done-1",
			},
			{
				type: "run-completed",
				runId: "r1",
				completedAt: "t7",
				durationMs: 70,
			},
		];

		let state = makeEmptyState("r1");
		for (const delta of deltas) {
			state = applyDelta(state, delta);
		}

		expect(state.status).toBe("completed");
		expect(state.stepRecords).toHaveLength(3); // s1 once, s2 twice
		expect(state.stepRecords.filter((r) => r.stepId === "s2")).toHaveLength(2);
	});

	test("step-completed with trace copies trace to record", () => {
		let state = makeEmptyState();
		state = applyDelta(state, {
			type: "run-started",
			runId: "run-1",
			startedAt: "t0",
		});
		state = applyDelta(state, {
			type: "step-started",
			stepId: "s1",
			path: [],
			startedAt: "t1",
		});
		const trace = [
			{ type: "log" as const, message: "starting extraction" },
			{ type: "agent-step" as const, step: { text: "hello", toolCalls: [] } },
		];
		state = applyDelta(state, {
			type: "step-completed",
			stepId: "s1",
			path: [],
			completedAt: "t2",
			durationMs: 100,
			output: "result",
			trace,
		});
		expect(state.stepRecords[0]?.trace).toEqual(trace);
	});

	test("step-completed without trace leaves trace undefined", () => {
		let state = makeEmptyState();
		state = applyDelta(state, {
			type: "run-started",
			runId: "run-1",
			startedAt: "t0",
		});
		state = applyDelta(state, {
			type: "step-started",
			stepId: "s1",
			path: [],
			startedAt: "t1",
		});
		state = applyDelta(state, {
			type: "step-completed",
			stepId: "s1",
			path: [],
			completedAt: "t2",
			durationMs: 100,
			output: "result",
		});
		expect(state.stepRecords[0]?.trace).toBeUndefined();
	});

	test("is pure — does not mutate input state", () => {
		const state = makeEmptyState();
		const frozen = JSON.parse(JSON.stringify(state));
		applyDelta(state, {
			type: "run-started",
			runId: "run-1",
			startedAt: "t0",
		});
		expect(state).toEqual(frozen);
	});
});

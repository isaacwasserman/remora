import { describe, expect, test } from "bun:test";
import type { ExecutionState } from "../executor/state";
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

	test("multiple executions of same step (for-each)", () => {
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
						status: "completed",
						startedAt: "t3",
						completedAt: "t4",
						durationMs: 20,
						output: "second",
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
								iterationIndex: 2,
								itemValue: "c",
							},
						],
					},
				],
			}),
		);

		const s = result.get("s1");
		expect(s?.executionCount).toBe(3);
		expect(s?.completedCount).toBe(2);
		expect(s?.failedCount).toBe(1);
		// Worst status wins: failed > completed
		expect(s?.status).toBe("failed");
		expect(s?.latestError?.code).toBe("ERR");
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

	test("status priority: running > completed", () => {
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
		expect(result.get("s1")?.status).toBe("running");
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

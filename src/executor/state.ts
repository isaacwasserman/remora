import { type } from "arktype";
import type { StepExecutionError } from "./errors";

// ─── Enums ───────────────────────────────────────────────────────

export const stepStatusSchema = type(
	"'pending' | 'running' | 'completed' | 'failed' | 'skipped'",
);
export type StepStatus = typeof stepStatusSchema.infer;

export const runStatusSchema = type(
	"'pending' | 'running' | 'completed' | 'failed'",
);
export type RunStatus = typeof runStatusSchema.infer;

// ─── Serializable Snapshots ──────────────────────────────────────

export const errorSnapshotSchema = type({
	code: "string",
	category: "string",
	message: "string",
	"stepId?": "string",
	"statusCode?": "number",
	"isRetryable?": "boolean",
});
export type ErrorSnapshot = typeof errorSnapshotSchema.infer;

export const retryRecordSchema = type({
	attempt: "number",
	startedAt: "string",
	failedAt: "string",
	errorCode: "string",
	errorMessage: "string",
});
export type RetryRecord = typeof retryRecordSchema.infer;

// ─── Execution Path ──────────────────────────────────────────────

export const executionPathSegmentSchema = type({
	type: "'for-each'",
	stepId: "string",
	iterationIndex: "number",
	itemValue: "unknown",
})
	.or({
		type: "'switch-case'",
		stepId: "string",
		matchedCaseIndex: "number",
		matchedValue: "unknown",
	})
	.or({
		type: "'wait-for-condition'",
		stepId: "string",
		pollAttempt: "number",
	});
export type ExecutionPathSegment = typeof executionPathSegmentSchema.infer;

// ─── Step Execution Record ───────────────────────────────────────

export const stepExecutionRecordSchema = type({
	stepId: "string",
	status: stepStatusSchema,
	"startedAt?": "string",
	"completedAt?": "string",
	"durationMs?": "number",
	"output?": "unknown",
	"error?": errorSnapshotSchema,
	"resolvedInputs?": "unknown",
	retries: [retryRecordSchema, "[]"],
	path: [executionPathSegmentSchema, "[]"],
});
export type StepExecutionRecord = typeof stepExecutionRecordSchema.infer;

// ─── Execution State ─────────────────────────────────────────────

export const executionStateSchema = type({
	runId: "string",
	status: runStatusSchema,
	startedAt: "string",
	"completedAt?": "string",
	"durationMs?": "number",
	stepRecords: [stepExecutionRecordSchema, "[]"],
	"output?": "unknown",
	"error?": errorSnapshotSchema,
});
export type ExecutionState = typeof executionStateSchema.infer;

// ─── Deltas ──────────────────────────────────────────────────────

export const executionDeltaSchema = type({
	type: "'run-started'",
	runId: "string",
	startedAt: "string",
})
	.or({
		type: "'step-started'",
		stepId: "string",
		path: [executionPathSegmentSchema, "[]"],
		startedAt: "string",
	})
	.or({
		type: "'step-completed'",
		stepId: "string",
		path: [executionPathSegmentSchema, "[]"],
		completedAt: "string",
		durationMs: "number",
		output: "unknown",
		"resolvedInputs?": "unknown",
	})
	.or({
		type: "'step-failed'",
		stepId: "string",
		path: [executionPathSegmentSchema, "[]"],
		failedAt: "string",
		durationMs: "number",
		error: errorSnapshotSchema,
		"resolvedInputs?": "unknown",
	})
	.or({
		type: "'step-retry'",
		stepId: "string",
		path: [executionPathSegmentSchema, "[]"],
		retry: retryRecordSchema,
	})
	.or({
		type: "'run-completed'",
		runId: "string",
		completedAt: "string",
		durationMs: "number",
		"output?": "unknown",
	})
	.or({
		type: "'run-failed'",
		runId: "string",
		failedAt: "string",
		durationMs: "number",
		error: errorSnapshotSchema,
	});
export type ExecutionDelta = typeof executionDeltaSchema.infer;

// ─── Helpers ─────────────────────────────────────────────────────

/** Convert a StepExecutionError class instance to a serializable snapshot. */
export function snapshotError(err: StepExecutionError): ErrorSnapshot {
	const snapshot: ErrorSnapshot = {
		code: err.code,
		category: err.category,
		message: err.message,
	};
	if (err.stepId) snapshot.stepId = err.stepId;
	if ("statusCode" in err && typeof err.statusCode === "number") {
		snapshot.statusCode = err.statusCode;
	}
	if ("isRetryable" in err && typeof err.isRetryable === "boolean") {
		snapshot.isRetryable = err.isRetryable;
	}
	return snapshot;
}

// ─── Path Matching ───────────────────────────────────────────────

function segmentsEqual(
	sa: ExecutionPathSegment,
	sb: ExecutionPathSegment,
): boolean {
	if (sa.type !== sb.type || sa.stepId !== sb.stepId) return false;
	if (sa.type === "for-each" && sb.type === "for-each") {
		return sa.iterationIndex === sb.iterationIndex;
	}
	if (sa.type === "switch-case" && sb.type === "switch-case") {
		return sa.matchedCaseIndex === sb.matchedCaseIndex;
	}
	if (sa.type === "wait-for-condition" && sb.type === "wait-for-condition") {
		return sa.pollAttempt === sb.pollAttempt;
	}
	return true;
}

function pathsEqual(
	a: ExecutionPathSegment[],
	b: ExecutionPathSegment[],
): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		const sa = a[i] as ExecutionPathSegment;
		const sb = b[i] as ExecutionPathSegment;
		if (!segmentsEqual(sa, sb)) return false;
	}
	return true;
}

function findRecordIndex(
	records: StepExecutionRecord[],
	stepId: string,
	path: ExecutionPathSegment[],
): number {
	for (let i = records.length - 1; i >= 0; i--) {
		const record = records[i] as StepExecutionRecord;
		if (record.stepId === stepId && pathsEqual(record.path, path)) {
			return i;
		}
	}
	return -1;
}

// ─── Pure Reducer ────────────────────────────────────────────────

/** Apply a delta to an execution state, returning a new state. Pure — no mutations. */
export function applyDelta(
	state: ExecutionState,
	delta: ExecutionDelta,
): ExecutionState {
	switch (delta.type) {
		case "run-started":
			return { ...state, status: "running", startedAt: delta.startedAt };

		case "step-started": {
			const record: StepExecutionRecord = {
				stepId: delta.stepId,
				status: "running",
				startedAt: delta.startedAt,
				retries: [],
				path: delta.path,
			};
			return {
				...state,
				stepRecords: [...state.stepRecords, record],
			};
		}

		case "step-completed": {
			const records = [...state.stepRecords];
			const idx = findRecordIndex(records, delta.stepId, delta.path);
			if (idx >= 0) {
				const existing = records[idx] as StepExecutionRecord;
				const updated: StepExecutionRecord = {
					...existing,
					status: "completed",
					completedAt: delta.completedAt,
					durationMs: delta.durationMs,
					output: delta.output,
				};
				if (delta.resolvedInputs !== undefined) {
					updated.resolvedInputs = delta.resolvedInputs;
				}
				records[idx] = updated;
			}
			return { ...state, stepRecords: records };
		}

		case "step-failed": {
			const records = [...state.stepRecords];
			const idx = findRecordIndex(records, delta.stepId, delta.path);
			if (idx >= 0) {
				const existing = records[idx] as StepExecutionRecord;
				const updated: StepExecutionRecord = {
					...existing,
					status: "failed",
					completedAt: delta.failedAt,
					durationMs: delta.durationMs,
					error: delta.error,
				};
				if (delta.resolvedInputs !== undefined) {
					updated.resolvedInputs = delta.resolvedInputs;
				}
				records[idx] = updated;
			}
			return { ...state, stepRecords: records };
		}

		case "step-retry": {
			const records = [...state.stepRecords];
			const idx = findRecordIndex(records, delta.stepId, delta.path);
			if (idx >= 0) {
				const existing = records[idx] as StepExecutionRecord;
				records[idx] = {
					...existing,
					retries: [...existing.retries, delta.retry],
				};
			}
			return { ...state, stepRecords: records };
		}

		case "run-completed":
			return {
				...state,
				status: "completed",
				completedAt: delta.completedAt,
				durationMs: delta.durationMs,
				output: delta.output,
			};

		case "run-failed":
			return {
				...state,
				status: "failed",
				completedAt: delta.failedAt,
				durationMs: delta.durationMs,
				error: delta.error,
			};
	}
}

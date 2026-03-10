import type {
	ExecutionState,
	StepExecutionRecord,
	StepStatus,
} from "../executor/state";

/** Aggregated execution summary for a single step across all its executions. */
export interface StepExecutionSummary {
	status: StepStatus;
	/** Total number of executions (>1 for steps in for-each loops). */
	executionCount: number;
	/** Number of completed executions. */
	completedCount: number;
	/** Number of failed executions. */
	failedCount: number;
	/** Total retries across all executions. */
	totalRetries: number;
	/** Output from the most recent successful execution. */
	latestOutput?: unknown;
	/** Error from the most recent failed execution. */
	latestError?: { code: string; message: string };
	/** Duration of the most recent execution in milliseconds. */
	latestDurationMs?: number;
}

const STATUS_PRIORITY: Record<StepStatus, number> = {
	failed: 4,
	running: 3,
	completed: 2,
	skipped: 1,
	pending: 0,
};

function worstStatus(a: StepStatus, b: StepStatus): StepStatus {
	return STATUS_PRIORITY[a] >= STATUS_PRIORITY[b] ? a : b;
}

/**
 * Filter step records to only the latest iteration of each for-each loop.
 * This ensures the viewer shows only the current/most-recent iteration's
 * execution path, clearing previous iterations' branch states.
 */
function filterToLatestIteration(
	records: StepExecutionRecord[],
): StepExecutionRecord[] {
	// Find the latest iteration index for each for-each step
	const latestIteration = new Map<string, number>();
	for (const record of records) {
		for (const seg of record.path) {
			if (seg.type === "for-each") {
				const prev = latestIteration.get(seg.stepId) ?? -1;
				if (seg.iterationIndex > prev) {
					latestIteration.set(seg.stepId, seg.iterationIndex);
				}
			}
		}
	}

	if (latestIteration.size === 0) return records;

	return records.filter((record) => {
		for (const seg of record.path) {
			if (seg.type === "for-each") {
				const latest = latestIteration.get(seg.stepId);
				if (latest !== undefined && seg.iterationIndex !== latest) {
					return false;
				}
			}
		}
		return true;
	});
}

/**
 * Derives a per-step summary map from the full execution state.
 * Groups step records by stepId and computes an aggregate status.
 * For steps inside for-each loops, only the latest iteration is shown.
 * Priority: failed > running > completed > skipped > pending.
 */
export function deriveStepSummaries(
	state: ExecutionState,
): Map<string, StepExecutionSummary> {
	const filtered = filterToLatestIteration(state.stepRecords);

	const grouped = new Map<string, StepExecutionRecord[]>();
	for (const record of filtered) {
		const existing = grouped.get(record.stepId);
		if (existing) {
			existing.push(record);
		} else {
			grouped.set(record.stepId, [record]);
		}
	}

	const summaries = new Map<string, StepExecutionSummary>();

	for (const [stepId, records] of grouped) {
		let status: StepStatus = "pending";
		let completedCount = 0;
		let failedCount = 0;
		let totalRetries = 0;
		let latestOutput: unknown;
		let latestError: { code: string; message: string } | undefined;
		let latestDurationMs: number | undefined;

		for (const record of records) {
			status = worstStatus(status, record.status);
			if (record.status === "completed") completedCount++;
			if (record.status === "failed") failedCount++;
			totalRetries += record.retries.length;

			if (record.output !== undefined) latestOutput = record.output;
			if (record.error) {
				latestError = {
					code: record.error.code,
					message: record.error.message,
				};
			}
			if (record.durationMs !== undefined) {
				latestDurationMs = record.durationMs;
			}
		}

		summaries.set(stepId, {
			status,
			executionCount: records.length,
			completedCount,
			failedCount,
			totalRetries,
			latestOutput,
			latestError,
			latestDurationMs,
		});
	}

	return summaries;
}

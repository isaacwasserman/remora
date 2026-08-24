import type { ExecutionState, StepExecutionRecord } from "@remoraflow/core";

export type StepStatus = "pending" | "running" | "completed" | "failed";

export interface StepExecutionSummary {
    status: StepStatus;
    executionCount: number;
    executions: StepExecutionRecord[];
    latestOutput?: unknown;
    latestError?: { code: string; message: string };
}

/** Groups the runtime's per-invocation records by their authored step ID. */
export function deriveStepSummaries(
    state: ExecutionState,
): Map<string, StepExecutionSummary> {
    const grouped = new Map<string, StepExecutionRecord[]>();
    for (const execution of state.stepExecutions) {
        const executions = grouped.get(execution.stepId) ?? [];
        executions.push(execution);
        grouped.set(execution.stepId, executions);
    }

    const summaries = new Map<string, StepExecutionSummary>();
    for (const [stepId, executions] of grouped) {
        const latest = executions.at(-1);
        if (!latest) continue;
        summaries.set(stepId, {
            status: latest.status,
            executionCount: executions.length,
            executions,
            ...(latest.output !== undefined
                ? { latestOutput: latest.output }
                : {}),
            ...(latest.error
                ? {
                      latestError: {
                          code: latest.error.code,
                          message: latest.error.message,
                      },
                  }
                : {}),
        });
    }
    return summaries;
}

/**
 * Returns the one-based execution order for every step on the trace ending at
 * the hovered invocation. A repeated step therefore receives every position
 * at which it appeared, such as `[4, 10]`.
 */
export function derivePathSequenceIndexes(
    state: ExecutionState,
    executionId: string | undefined,
): Map<string, number[]> {
    const endingIndex = executionId
        ? state.stepExecutions.findIndex(
              (execution) => execution.executionId === executionId,
          )
        : -1;
    const indexes = new Map<string, number[]>();
    for (const [index, execution] of state.stepExecutions.entries()) {
        if (index > endingIndex) break;
        const stepIndexes = indexes.get(execution.stepId) ?? [];
        stepIndexes.push(index + 1);
        indexes.set(execution.stepId, stepIndexes);
    }
    return indexes;
}

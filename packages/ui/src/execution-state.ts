import type { ExecutionState } from "@remoraflow/core";

export type StepStatus = "pending" | "running" | "completed" | "failed";

export interface StepExecutionSummary {
    status: StepStatus;
    executionCount: number;
    latestOutput?: unknown;
    latestError?: { code: string; message: string };
}

function extractLeafStepId(stepPath: string[]): string | undefined {
    return stepPath[stepPath.length - 1];
}

export function deriveStepSummaries(
    state: ExecutionState,
): Map<string, StepExecutionSummary> {
    const summaries = new Map<string, StepExecutionSummary>();
    const executionCounts = new Map<string, number>();

    for (const path of state.executionPath) {
        const stepId = extractLeafStepId(path);
        if (!stepId) continue;
        executionCounts.set(stepId, (executionCounts.get(stepId) ?? 0) + 1);
    }

    const lastPath =
        state.executionPath.length > 0
            ? state.executionPath[state.executionPath.length - 1]
            : null;
    const lastStepId = lastPath ? extractLeafStepId(lastPath) : null;

    const isTerminal = state.status === "success" || state.status === "error";

    const runningStepId =
        "runningStepPath" in state && state.runningStepPath
            ? extractLeafStepId(state.runningStepPath)
            : null;

    if (runningStepId && !executionCounts.has(runningStepId)) {
        executionCounts.set(runningStepId, 0);
    }

    for (const [stepId, count] of executionCounts) {
        let status: StepStatus;
        if (
            stepId === lastStepId &&
            state.status === "error" &&
            !(stepId in state.scope)
        ) {
            status = "failed";
        } else if (stepId === runningStepId && !isTerminal) {
            status = "running";
        } else if (stepId === lastStepId && !isTerminal) {
            status = "running";
        } else {
            // An execution-path entry is emitted after a step has begun. Many
            // step types (sleep, start, and nested-chain steps) do not leave
            // an output in the outer scope, but they still completed.
            status = "completed";
        }

        const summary: StepExecutionSummary = {
            status,
            executionCount: count,
        };

        if (stepId in state.scope) {
            summary.latestOutput = state.scope[stepId];
        }

        if (status === "failed" && state.error) {
            summary.latestError = {
                code: state.error.code,
                message: state.error.message,
            };
        }

        summaries.set(stepId, summary);
    }

    return summaries;
}

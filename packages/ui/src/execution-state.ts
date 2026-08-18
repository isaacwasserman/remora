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

    const isTerminal =
        state.status === "success" || state.status === "error";

    for (const [stepId, count] of executionCounts) {
        const inScope = stepId in state.scope;

        let status: StepStatus;
        if (inScope) {
            status = "completed";
        } else if (
            stepId === lastStepId &&
            state.status === "error" &&
            !inScope
        ) {
            status = "failed";
        } else if (stepId === lastStepId && !isTerminal) {
            status = "running";
        } else {
            status = "pending";
        }

        const summary: StepExecutionSummary = {
            status,
            executionCount: count,
        };

        if (inScope) {
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

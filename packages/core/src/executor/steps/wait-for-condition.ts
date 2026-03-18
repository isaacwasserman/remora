import type { WorkflowStep } from "../../types";
import type { DurableContext } from "../context";
import type {
  ExecuteChainFn,
  ExecutionStateManager,
  ExecutionTimer,
  Expression,
  ResolvedExecuteWorkflowOptions,
} from "../executor-types";
import { evaluateExpression } from "../helpers";
import type { ExecutionPathSegment } from "../state";

export async function executeWaitForCondition(
  step: WorkflowStep & { type: "wait-for-condition" },
  scope: Record<string, unknown>,
  stepIndex: Map<string, WorkflowStep>,
  stepOutputs: Record<string, unknown>,
  loopVars: Record<string, unknown>,
  options: ResolvedExecuteWorkflowOptions,
  context: DurableContext,
  timer: ExecutionTimer,
  stateManager: ExecutionStateManager | undefined,
  execPath: ExecutionPathSegment[],
  executeChain: ExecuteChainFn,
): Promise<unknown> {
  const limits = timer.resolvedLimits;

  const maxAttempts = Math.min(
    step.params.maxAttempts
      ? (evaluateExpression(
          step.params.maxAttempts as Expression,
          scope,
          step.id,
        ) as number)
      : 10,
    limits.maxAttempts,
  );
  const intervalMs = Math.min(
    step.params.intervalMs
      ? (evaluateExpression(
          step.params.intervalMs as Expression,
          scope,
          step.id,
        ) as number)
      : 1000,
    limits.maxSleepMs,
  );
  const rawBackoff = step.params.backoffMultiplier
    ? (evaluateExpression(
        step.params.backoffMultiplier as Expression,
        scope,
        step.id,
      ) as number)
    : 1;
  const backoffMultiplier = Math.max(
    limits.minBackoffMultiplier,
    Math.min(rawBackoff, limits.maxBackoffMultiplier),
  );
  const timeoutMs = step.params.timeoutMs
    ? Math.min(
        evaluateExpression(
          step.params.timeoutMs as Expression,
          scope,
          step.id,
        ) as number,
        limits.maxTimeoutMs,
      )
    : undefined;

  let pollAttempt = 0;
  return context.waitForCondition(
    step.id,
    async () => {
      const pollPath: ExecutionPathSegment[] = [
        ...execPath,
        {
          type: "wait-for-condition" as const,
          stepId: step.id,
          pollAttempt: pollAttempt++,
        },
      ];
      timer.beginActive();
      try {
        await executeChain(
          step.params.conditionStepId,
          stepIndex,
          stepOutputs,
          loopVars,
          options,
          context,
          undefined,
          stateManager,
          pollPath,
        );
        const updatedScope = { ...stepOutputs, ...loopVars };
        return evaluateExpression(
          step.params.condition as Expression,
          updatedScope,
          step.id,
        );
      } finally {
        timer.endActive(step.id);
      }
    },
    { maxAttempts, intervalMs, backoffMultiplier, timeoutMs },
  );
}

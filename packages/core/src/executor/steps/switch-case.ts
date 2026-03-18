import type { WorkflowStep } from "../../types";
import type { DurableContext } from "../context";
import type {
  ExecuteChainFn,
  ExecutionStateManager,
  Expression,
  ResolvedExecuteWorkflowOptions,
} from "../executor-types";
import { evaluateExpression } from "../helpers";
import type { ExecutionPathSegment } from "../state";

export async function executeSwitchCase(
  step: WorkflowStep & { type: "switch-case" },
  scope: Record<string, unknown>,
  stepIndex: Map<string, WorkflowStep>,
  stepOutputs: Record<string, unknown>,
  loopVars: Record<string, unknown>,
  options: ResolvedExecuteWorkflowOptions,
  context: DurableContext,
  stateManager: ExecutionStateManager | undefined,
  execPath: ExecutionPathSegment[],
  executeChain: ExecuteChainFn,
): Promise<unknown> {
  const switchValue = evaluateExpression(
    step.params.switchOn as Expression,
    scope,
    step.id,
  );

  let matchedBranchId: string | undefined;
  let defaultBranchId: string | undefined;
  let matchedCaseIndex = -1;

  for (let i = 0; i < step.params.cases.length; i++) {
    const c = step.params.cases[i] as (typeof step.params.cases)[number];
    if (c.value.type === "default") {
      defaultBranchId = c.branchBodyStepId;
      if (matchedCaseIndex === -1) matchedCaseIndex = i;
    } else {
      const caseValue = evaluateExpression(
        c.value as Expression,
        scope,
        step.id,
      );
      if (caseValue === switchValue) {
        matchedBranchId = c.branchBodyStepId;
        matchedCaseIndex = i;
        break;
      }
    }
  }

  const selectedBranchId = matchedBranchId ?? defaultBranchId;
  if (!selectedBranchId) {
    return undefined;
  }

  const branchPath: ExecutionPathSegment[] = [
    ...execPath,
    {
      type: "switch-case" as const,
      stepId: step.id,
      matchedCaseIndex,
      matchedValue: switchValue,
    },
  ];

  return await executeChain(
    selectedBranchId,
    stepIndex,
    stepOutputs,
    loopVars,
    options,
    context,
    undefined,
    stateManager,
    branchPath,
  );
}

export function resolveSwitchCaseInputs(
  step: WorkflowStep & { type: "switch-case" },
  scope: Record<string, unknown>,
): unknown {
  try {
    return {
      switchOn: evaluateExpression(
        step.params.switchOn as Expression,
        scope,
        step.id,
      ),
    };
  } catch {
    return undefined;
  }
}

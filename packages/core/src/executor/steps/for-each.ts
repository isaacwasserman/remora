import type { WorkflowStep } from "../../types";
import type { DurableContext } from "../context";
import { ValidationError } from "../errors";
import type {
	ExecuteChainFn,
	ExecutionStateManager,
	Expression,
	ResolvedExecuteWorkflowOptions,
} from "../executor-types";
import { evaluateExpression } from "../helpers";
import type { ExecutionPathSegment } from "../state";

export async function executeForEach(
	step: WorkflowStep & { type: "for-each" },
	scope: Record<string, unknown>,
	stepIndex: Map<string, WorkflowStep>,
	stepOutputs: Record<string, unknown>,
	loopVars: Record<string, unknown>,
	options: ResolvedExecuteWorkflowOptions,
	context: DurableContext,
	stateManager: ExecutionStateManager | undefined,
	execPath: ExecutionPathSegment[],
	executeChain: ExecuteChainFn,
): Promise<unknown[]> {
	const target = evaluateExpression(
		step.params.target as Expression,
		scope,
		step.id,
	);

	if (!Array.isArray(target)) {
		throw new ValidationError(
			step.id,
			"FOREACH_TARGET_NOT_ARRAY",
			`for-each target must be an array, got ${typeof target}`,
			target,
		);
	}

	const results: unknown[] = [];
	for (let i = 0; i < target.length; i++) {
		const item = target[i];
		const iterationPath: ExecutionPathSegment[] = [
			...execPath,
			{
				type: "for-each" as const,
				stepId: step.id,
				iterationIndex: i,
				itemValue: item,
			},
		];
		const innerLoopVars = { ...loopVars, [step.params.itemName]: item };
		const lastOutput = await executeChain(
			step.params.loopBodyStepId,
			stepIndex,
			stepOutputs,
			innerLoopVars,
			options,
			context,
			undefined,
			stateManager,
			iterationPath,
		);
		results.push(lastOutput);
	}
	return results;
}

export function resolveForEachInputs(
	step: WorkflowStep & { type: "for-each" },
	scope: Record<string, unknown>,
): unknown {
	try {
		return {
			target: evaluateExpression(
				step.params.target as Expression,
				scope,
				step.id,
			),
		};
	} catch {
		return undefined;
	}
}

import type { WorkflowStep } from "../../types";
import type { Expression } from "../executor-types";
import { evaluateExpression } from "../helpers";

export function executeEnd(
	step: WorkflowStep & { type: "end" },
	scope: Record<string, unknown>,
): unknown {
	if (step.params?.output) {
		return evaluateExpression(step.params.output as Expression, scope, step.id);
	}
	return undefined;
}

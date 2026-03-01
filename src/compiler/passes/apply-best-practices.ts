import type { WorkflowDefinition, WorkflowStep } from "../../types";
import type { ExecutionGraph } from "../types";

/**
 * A best-practice rule that can non-destructively modify a workflow.
 * Each rule receives a deep-cloned workflow and the execution graph,
 * and returns the (possibly modified) workflow.
 */
export type BestPracticeRule = (
	workflow: WorkflowDefinition,
	graph: ExecutionGraph,
) => WorkflowDefinition;

/**
 * Registry of best-practice rules applied in order.
 * Add new rules here to have them run automatically.
 */
const rules: BestPracticeRule[] = [addMissingEndSteps];

/**
 * Applies all registered best-practice rules to a deep copy of the workflow.
 * The original workflow is never mutated.
 */
export function applyBestPractices(
	workflow: WorkflowDefinition,
	graph: ExecutionGraph,
): WorkflowDefinition {
	let result = structuredClone(workflow);

	for (const rule of rules) {
		result = rule(result, graph);
	}

	return result;
}

/**
 * Ensures every terminal step (a step with no nextStepId that isn't
 * already an "end" step) gets an explicit "end" step appended.
 */
function addMissingEndSteps(
	workflow: WorkflowDefinition,
	_graph: ExecutionGraph,
): WorkflowDefinition {
	const newEndSteps: WorkflowStep[] = [];

	for (const step of workflow.steps) {
		if (step.type === "end") continue;
		if (step.nextStepId) continue;

		const endStepId = `${step.id}_end`;
		step.nextStepId = endStepId;
		newEndSteps.push({
			id: endStepId,
			name: "End",
			description: `End of chain after ${step.id}`,
			type: "end",
		});
	}

	workflow.steps.push(...newEndSteps);
	return workflow;
}

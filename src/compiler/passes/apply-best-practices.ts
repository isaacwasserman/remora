import type { WorkflowDefinition, WorkflowStep } from "../../types";
import type { Diagnostic, ExecutionGraph } from "../types";

interface BestPracticeRuleResult {
	workflow: WorkflowDefinition;
	diagnostics: Diagnostic[];
}

/**
 * A best-practice rule that can non-destructively modify a workflow.
 * Each rule receives a deep-cloned workflow and the execution graph,
 * and returns the (possibly modified) workflow along with any diagnostics.
 */
export type BestPracticeRule = (
	workflow: WorkflowDefinition,
	graph: ExecutionGraph,
) => BestPracticeRuleResult;

/**
 * Registry of best-practice rules applied in order.
 * Add new rules here to have them run automatically.
 */
const rules: BestPracticeRule[] = [addMissingStartStep, addMissingEndSteps];

/**
 * Applies all registered best-practice rules to a deep copy of the workflow.
 * The original workflow is never mutated.
 */
export function applyBestPractices(
	workflow: WorkflowDefinition,
	graph: ExecutionGraph,
): BestPracticeRuleResult {
	let result = structuredClone(workflow);
	const allDiagnostics: Diagnostic[] = [];

	for (const rule of rules) {
		const ruleResult = rule(result, graph);
		result = ruleResult.workflow;
		allDiagnostics.push(...ruleResult.diagnostics);
	}

	return { workflow: result, diagnostics: allDiagnostics };
}

/**
 * Ensures the workflow has a start step. If none exists, one is
 * auto-inserted with an empty input schema.
 */
function addMissingStartStep(
	workflow: WorkflowDefinition,
	_graph: ExecutionGraph,
): BestPracticeRuleResult {
	const diagnostics: Diagnostic[] = [];

	const hasStartStep = workflow.steps.some((s) => s.type === "start");
	if (hasStartStep) {
		return { workflow, diagnostics };
	}

	const startStepId = "__start";
	const oldInitialStepId = workflow.initialStepId;

	const startStep: WorkflowStep = {
		id: startStepId,
		name: "Start",
		description: "Auto-generated start step",
		type: "start",
		nextStepId: oldInitialStepId,
	};

	workflow.steps.unshift(startStep);
	workflow.initialStepId = startStepId;

	diagnostics.push({
		severity: "warning",
		location: { stepId: null, field: "initialStepId" },
		message:
			"Workflow has no start step; one was automatically added with an empty input schema",
		code: "MISSING_START_STEP",
	});

	return { workflow, diagnostics };
}

/**
 * Ensures every terminal step (a step with no nextStepId that isn't
 * already an "end" step) gets an explicit "end" step appended.
 */
function addMissingEndSteps(
	workflow: WorkflowDefinition,
	_graph: ExecutionGraph,
): BestPracticeRuleResult {
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
	return { workflow, diagnostics: [] };
}

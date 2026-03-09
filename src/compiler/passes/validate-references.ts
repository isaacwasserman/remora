import type { WorkflowDefinition } from "../../types";
import type { Diagnostic } from "../types";

export function validateReferences(workflow: WorkflowDefinition): Diagnostic[] {
	const diagnostics: Diagnostic[] = [];
	const stepIds = new Set(workflow.steps.map((s) => s.id));

	// Check initialStepId
	if (!stepIds.has(workflow.initialStepId)) {
		diagnostics.push({
			severity: "error",
			location: { stepId: null, field: "initialStepId" },
			message: `Initial step '${workflow.initialStepId}' does not exist`,
			code: "MISSING_INITIAL_STEP",
		});
	}

	for (const step of workflow.steps) {
		// Check nextStepId
		if (step.nextStepId && !stepIds.has(step.nextStepId)) {
			diagnostics.push({
				severity: "error",
				location: { stepId: step.id, field: "nextStepId" },
				message: `Step '${step.id}' references non-existent next step '${step.nextStepId}'`,
				code: "MISSING_NEXT_STEP",
			});
		}

		// Check branchBodyStepId in switch-case
		if (step.type === "switch-case") {
			for (const [i, c] of step.params.cases.entries()) {
				if (!stepIds.has(c.branchBodyStepId)) {
					diagnostics.push({
						severity: "error",
						location: {
							stepId: step.id,
							field: `params.cases[${i}].branchBodyStepId`,
						},
						message: `Step '${step.id}' case ${i} references non-existent branch body step '${c.branchBodyStepId}'`,
						code: "MISSING_BRANCH_BODY_STEP",
					});
				}
			}
		}

		// Check loopBodyStepId in for-each
		if (step.type === "for-each") {
			if (!stepIds.has(step.params.loopBodyStepId)) {
				diagnostics.push({
					severity: "error",
					location: {
						stepId: step.id,
						field: "params.loopBodyStepId",
					},
					message: `Step '${step.id}' references non-existent loop body step '${step.params.loopBodyStepId}'`,
					code: "MISSING_LOOP_BODY_STEP",
				});
			}
		}

		// Check conditionStepId in wait-for-condition
		if (step.type === "wait-for-condition") {
			if (!stepIds.has(step.params.conditionStepId)) {
				diagnostics.push({
					severity: "error",
					location: {
						stepId: step.id,
						field: "params.conditionStepId",
					},
					message: `Step '${step.id}' references non-existent condition body step '${step.params.conditionStepId}'`,
					code: "MISSING_CONDITION_BODY_STEP",
				});
			}
		}
	}

	return diagnostics;
}

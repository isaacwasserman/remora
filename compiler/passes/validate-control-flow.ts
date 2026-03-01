import type { WorkflowDefinition } from "../../types";
import type { Diagnostic, ExecutionGraph } from "../types";

export function validateControlFlow(
	workflow: WorkflowDefinition,
	graph: ExecutionGraph,
): Diagnostic[] {
	const diagnostics: Diagnostic[] = [];

	for (const step of workflow.steps) {
		// End steps should not have nextStepId
		if (step.type === "end" && step.nextStepId) {
			diagnostics.push({
				severity: "error",
				location: { stepId: step.id, field: "nextStepId" },
				message: `End step '${step.id}' should not have a nextStepId`,
				code: "END_STEP_HAS_NEXT",
			});
		}

		// Switch-case: at most one default case
		if (step.type === "switch-case") {
			const defaultCount = step.params.cases.filter(
				(c) => c.value.type === "default",
			).length;
			if (defaultCount > 1) {
				diagnostics.push({
					severity: "error",
					location: { stepId: step.id, field: "params.cases" },
					message: `Switch-case step '${step.id}' has ${defaultCount} default cases (expected at most 1)`,
					code: "MULTIPLE_DEFAULT_CASES",
				});
			}

			// Validate branch bodies don't escape
			for (const [i, c] of step.params.cases.entries()) {
				const escapes = checkBodyEscapes(
					c.branchBodyStepId,
					step.id,
					graph,
				);
				if (escapes) {
					diagnostics.push({
						severity: "warning",
						location: {
							stepId: step.id,
							field: `params.cases[${i}].branchBodyStepId`,
						},
						message: `Branch body starting at '${c.branchBodyStepId}' in step '${step.id}' has a step ('${escapes.escapingStep}') whose nextStepId points outside the branch body to '${escapes.target}'`,
						code: "BRANCH_BODY_ESCAPES",
					});
				}
			}
		}

		// For-each: validate loop body doesn't escape
		if (step.type === "for-each") {
			const escapes = checkBodyEscapes(
				step.params.loopBodyStepId,
				step.id,
				graph,
			);
			if (escapes) {
				diagnostics.push({
					severity: "warning",
					location: {
						stepId: step.id,
						field: "params.loopBodyStepId",
					},
					message: `Loop body starting at '${step.params.loopBodyStepId}' in step '${step.id}' has a step ('${escapes.escapingStep}') whose nextStepId points outside the loop body to '${escapes.target}'`,
					code: "LOOP_BODY_ESCAPES",
				});
			}
		}
	}

	return diagnostics;
}

/**
 * Check if a body chain (loop body or branch body) has a step whose
 * nextStepId points outside the body. Follow the chain from startId
 * through nextStepId links; all steps in this chain should be owned
 * by parentStepId.
 */
function checkBodyEscapes(
	startId: string,
	parentStepId: string,
	graph: ExecutionGraph,
): { escapingStep: string; target: string } | null {
	let currentId: string | undefined = startId;
	const visited = new Set<string>();

	while (currentId) {
		if (visited.has(currentId)) break;
		visited.add(currentId);

		const step = graph.stepIndex.get(currentId);
		if (!step) break;

		if (step.nextStepId) {
			// Check if the next step is still owned by the same parent
			const nextOwner = graph.bodyOwnership.get(step.nextStepId);
			const currentOwner = graph.bodyOwnership.get(currentId);

			// The next step is escaping if:
			// 1. The current step is in the body (owned by parentStepId)
			// 2. The next step is NOT in the body (not owned by parentStepId)
			if (
				(currentOwner === parentStepId || currentId === startId) &&
				nextOwner !== parentStepId
			) {
				return { escapingStep: currentId, target: step.nextStepId };
			}
		}

		currentId = step.nextStepId;
	}

	return null;
}

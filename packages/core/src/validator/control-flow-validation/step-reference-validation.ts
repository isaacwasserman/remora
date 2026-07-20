import type { WorkflowDefinition } from "../../schema";
import { buildStepIndex } from "../../utils";
import type { ValidatorError } from "../types";

export function validateStepReferences(
    workflowDefinition: WorkflowDefinition,
): {
    diagnostics: ValidatorError[];
} {
    const stepsById = buildStepIndex(workflowDefinition);

    const diagnostics: ValidatorError[] = [];
    if (!stepsById.get(workflowDefinition.initialStepId)) {
        diagnostics.push({
            severity: "error",
            path: ["initialStepId"],
            message: `Step "${workflowDefinition.initialStepId}" is given as the initialStepId, but it cannot be found in the workflow's step definitions.`,
        });
    }
    for (const [stepIndex, step] of workflowDefinition.steps.entries()) {
        switch (step.type) {
            case "switch-case": {
                for (const [
                    branchCaseIndex,
                    branchCase,
                ] of step.params.cases.entries()) {
                    if (!stepsById.get(branchCase.branchBodyStepId)) {
                        diagnostics.push({
                            severity: "error",
                            path: [
                                "steps",
                                stepIndex,
                                "params",
                                "cases",
                                branchCaseIndex,
                                "branchBodyStepId",
                            ],
                            message: `Step "${branchCase.branchBodyStepId}" was given as the start of branch ${branchCaseIndex} of switch-case step "${step.id}", but it cannot be found in the workflow's step definitions.`,
                        });
                    }
                }
                break;
            }
            case "for-each": {
                if (!stepsById.get(step.params.loopBodyStepId)) {
                    diagnostics.push({
                        severity: "error",
                        path: ["steps", stepIndex, "params", "loopBodyStepId"],
                        message: `Step "${step.params.loopBodyStepId}" was given as the start of the loop body for the for-each step "${step.id}", but it cannot be found in the workflow's step definitions.`,
                    });
                }
            }
        }
        if (step.nextStepId && !stepsById.get(step.nextStepId)) {
            diagnostics.push({
                severity: "error",
                path: ["steps", stepIndex, "nextStepId"],
                message: `Step "${step.nextStepId}" was given as the nextStepId of step "${step.id}", but it cannot be found in the workflow's step definitions.`,
            });
        }
    }
    return { diagnostics };
}

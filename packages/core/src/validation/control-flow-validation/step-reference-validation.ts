import type { WorkflowDefinition } from "../../schema";
import { nestedChains } from "../../step-registry";
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
        for (const chain of nestedChains(step)) {
            if (!stepsById.get(chain.entryPointStepId)) {
                diagnostics.push({
                    severity: "error",
                    path: ["steps", stepIndex, ...chain.path],
                    message: `Step "${chain.entryPointStepId}" was given as the start of ${chain.description}, but it cannot be found in the workflow's step definitions.`,
                });
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

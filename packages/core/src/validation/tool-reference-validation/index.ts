import type { WorkflowDefinition } from "../../schema";
import { toolReferences } from "../../step-registry";
import type { ToolSet } from "../../types";
import type { ValidationModule, ValidatorError } from "../types";

export function validateWorkflowToolNames(
    workflowDefinition: WorkflowDefinition,
    tools: ToolSet,
) {
    const diagnostics: ValidatorError[] = [];
    for (
        let stepIndex = 0;
        stepIndex < workflowDefinition.steps.length;
        stepIndex++
    ) {
        const step = workflowDefinition.steps[stepIndex];
        if (!step) continue;
        for (const ref of toolReferences(step)) {
            if (!(ref.toolName in tools)) {
                diagnostics.push({
                    severity: "error",
                    path: ["steps", stepIndex, ...ref.path],
                    message: `Step "${step.id}": Tool "${ref.toolName}" is not available in the given toolset.`,
                });
            }
        }
    }
    return diagnostics;
}

export const toolReferenceValidator: ValidationModule = {
    id: "tool-reference",
    failureMode: "continue",
    validate: (workflowDefinition, { tools }) => {
        const diagnostics = validateWorkflowToolNames(
            workflowDefinition,
            tools,
        );
        return { diagnostics };
    },
};

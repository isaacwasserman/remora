import type { WorkflowDefinition } from "../schema";
import type { ToolSet } from ".";
import type { ValidatorError } from "./types";

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
        if (step?.type !== "tool-call") continue;
        if (!(step.params.toolName in tools)) {
            diagnostics.push({
                severity: "error",
                path: [
                    "workflowDefinition",
                    "steps",
                    stepIndex,
                    "params",
                    "toolName",
                ],
                message: `Step "${step.id}": Tool "${step.params.toolName}" is not available in the given toolset.`,
            });
        }
    }
    return diagnostics;
}

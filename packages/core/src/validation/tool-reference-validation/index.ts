import type { WorkflowDefinition } from "../../schema";
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
        if (step?.type === "tool-call") {
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
        } else if (step?.type === "agent-loop") {
            for (const [toolIndex, toolName] of step.params.tools.entries()) {
                if (!(toolName in tools)) {
                    diagnostics.push({
                        severity: "error",
                        path: [
                            "workflowDefinition",
                            "steps",
                            stepIndex,
                            "params",
                            "tools",
                            toolIndex,
                        ],
                        message: `Step "${step.id}": Tool "${toolName}" is not available in the given toolset.`,
                    });
                }
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

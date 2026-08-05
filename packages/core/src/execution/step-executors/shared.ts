import type { WorkflowDefinition } from "../../schema";
import type { AnyTool, ToolSet } from "../../types";

export function resolveTools(allTools: ToolSet, toolNames: string[]): ToolSet {
    const resolvedTools = toolNames.map(
        (toolName) => [toolName, allTools[toolName]] as const,
    );
    for (const [toolName, resolvedTool] of resolvedTools) {
        if (!resolvedTool) {
            throw new Error(`Tool "${toolName}" not found in agent config.`);
        }
    }
    return Object.fromEntries(
        resolvedTools.filter((entry): entry is [string, AnyTool] => !!entry[1]),
    );
}

export function stepIndex(
    workflowDefinition: WorkflowDefinition,
    stepId: string,
): number {
    return workflowDefinition.steps.findIndex((step) => step.id === stepId);
}

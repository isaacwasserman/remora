import type { WorkflowDefinition } from "../schema";
import type { RemoraflowOptions, ToolSet } from "../types";

export type GenerationOptions = RemoraflowOptions & {};

export function generateWorkflow({
    taskDescription,
    tools,
    options,
}: {
    taskDescription: string;
    tools: ToolSet;
    options: RemoraflowOptions;
}): WorkflowDefinition {
    throw new Error("NOT IMPLEMENTED");
}

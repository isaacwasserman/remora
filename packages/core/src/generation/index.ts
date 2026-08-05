import type { WorkflowDefinition } from "../schema";
import type { RemoraflowSettings, ToolSet } from "../types";

export type GenerationOptions = RemoraflowSettings & {};

export function generateWorkflow({
    taskDescription,
    tools,
    options,
}: {
    taskDescription: string;
    tools: ToolSet;
    options: RemoraflowSettings;
}): WorkflowDefinition {
    throw new Error("NOT IMPLEMENTED");
}

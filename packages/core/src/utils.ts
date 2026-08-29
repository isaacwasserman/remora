import type { WorkflowDefinition, WorkflowStep } from "./schema";

export function buildStepIndex(
    workflowDefinition: WorkflowDefinition,
): Map<string, WorkflowStep & { index: number }> {
    const stepsById = new Map<string, WorkflowStep & { index: number }>();
    for (let i = 0; i < workflowDefinition.steps.length; i++) {
        const step = workflowDefinition.steps[i] as WorkflowStep;
        stepsById.set(step.id, { ...step, index: i });
    }
    return stepsById;
}

export function hashWorkflow(workflow: WorkflowDefinition): string {
    const str = JSON.stringify(workflow);
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
}

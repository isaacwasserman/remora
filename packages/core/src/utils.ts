import type { WorkflowDefinition, WorkflowStep } from "./schema";

export {
    isBlockStep,
    type NestedChain,
    nestedChainEntryPoints,
    nestedChains,
} from "./step-registry";

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

import type { WorkflowDefinition, WorkflowStep } from "./schema";

/** A {@link WorkflowStep} without the fields test fixtures fill in for you. */
type StepBody<T extends WorkflowStep = WorkflowStep> = T extends WorkflowStep
    ? Omit<T, "id" | "name" | "description">
    : never;

/** A step whose `name` and `description` are irrelevant to what is asserted. */
export function step(id: string, body: StepBody): WorkflowStep {
    return { id, name: id, description: id, ...body };
}

/** A workflow entered at its first step. */
export function workflow(...steps: WorkflowStep[]): WorkflowDefinition {
    const [first] = steps;
    if (!first) {
        throw new Error("a workflow needs at least one step");
    }
    return { initialStepId: first.id, steps };
}

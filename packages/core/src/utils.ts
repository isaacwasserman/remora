import type { WorkflowDefinition, WorkflowStep } from "./schema";

type StepOfType<T extends WorkflowStep["type"]> = Extract<
    WorkflowStep,
    { type: T }
>;

/** A chain of steps nested inside a block step. */
export type NestedChain = {
    /** Id of the chain's first step. */
    entryPointStepId: string;
    /** Path of the field declaring the entry point, relative to the step. */
    path: PropertyKey[];
    /** Describes the chain in diagnostics, e.g. `the loop body of ...`. */
    description: string;
    /**
     * Whether the chain's terminal step supplies a value to the enclosing step
     * (so it should end in `end`). False for chains whose result is read from
     * scope instead, like a `wait-for-condition` condition chain.
     */
    contributesOutput: boolean;
};

/**
 * Every chain nested inside a step — loop bodies, switch branches, condition
 * chains. A step type with entries here is a *block step*: its nested chains
 * run to completion before execution continues past it.
 *
 * Every walker of the step graph must consult this rather than matching on step
 * types itself, so a new block-introducing step type cannot be handled by one
 * walker and silently forgotten by another.
 */
const nestedChainsByStepType: {
    [T in WorkflowStep["type"]]: (step: StepOfType<T>) => NestedChain[];
} = {
    "for-each": (step) => [
        {
            entryPointStepId: step.params.loopBodyStepId,
            path: ["params", "loopBodyStepId"],
            description: `the loop body of for-each step "${step.id}"`,
            contributesOutput: true,
        },
    ],
    "switch-case": (step) =>
        step.params.cases.map((branchCase, caseIndex) => ({
            entryPointStepId: branchCase.branchBodyStepId,
            path: ["params", "cases", caseIndex, "branchBodyStepId"],
            description: `the branch body of case ${caseIndex} in switch-case step "${step.id}"`,
            contributesOutput: true,
        })),
    "wait-for-condition": (step) => [
        {
            entryPointStepId: step.params.conditionStepId,
            path: ["params", "conditionStepId"],
            description: `the condition chain of wait-for-condition step "${step.id}"`,
            contributesOutput: false,
        },
    ],
    "agent-loop": () => [],
    "request-intervention": () => [],
    "extract-data": () => [],
    "llm-prompt": () => [],
    "tool-call": () => [],
    end: () => [],
    sleep: () => [],
    start: () => [],
};

/** @see {@link nestedChainsByStepType} */
export function nestedChains(step: WorkflowStep): NestedChain[] {
    const chainsOf = nestedChainsByStepType[step.type] as (
        step: WorkflowStep,
    ) => NestedChain[];
    return chainsOf(step);
}

/** @see {@link nestedChainsByStepType} */
export function nestedChainEntryPoints(step: WorkflowStep): string[] {
    return nestedChains(step).map((chain) => chain.entryPointStepId);
}

/** Whether the step introduces nested chains that run before it completes. */
export function isBlockStep(step: WorkflowStep): boolean {
    return nestedChains(step).length > 0;
}

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

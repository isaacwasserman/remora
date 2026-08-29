import type { WorkflowDefinition } from "../../schema";
import { nestedChainEntryPoints } from "../../step-registry";
import { assertNeverStep, type StepType } from "../../step-types";
import type { ValidationModule, ValidatorDiagnostic } from "../types";

type NestingDepthReducer<T extends StepType> = (args: {
    workflow: WorkflowDefinition;
    step: Extract<WorkflowDefinition["steps"][number], { type: T }>;
    recurse: (stepId: string | undefined, seen: Set<string>) => number;
    seen: Set<string>;
}) => number;

const NESTING_DEPTH_REDUCERS: { [T in StepType]: NestingDepthReducer<T> } = {
    "for-each": ({ step, recurse, seen }) =>
        Math.max(
            recurse(step.nextStepId, seen),
            1 + recurse(step.params.loopBodyStepId, seen),
        ),
    "switch-case": ({ step, recurse, seen }) =>
        Math.max(
            recurse(step.nextStepId, seen),
            ...step.params.cases.map(
                (c) => 1 + recurse(c.branchBodyStepId, seen),
            ),
        ),
    while: ({ step, recurse, seen }) =>
        Math.max(
            recurse(step.nextStepId, seen),
            1 + recurse(step.params.conditionStepId, seen),
            1 + recurse(step.params.loopBodyStepId, seen),
        ),
    "agent-loop": ({ step, recurse, seen }) => recurse(step.nextStepId, seen),
    "request-intervention": ({ step, recurse, seen }) =>
        recurse(step.nextStepId, seen),
    "extract-data": ({ step, recurse, seen }) => recurse(step.nextStepId, seen),
    "llm-prompt": ({ step, recurse, seen }) => recurse(step.nextStepId, seen),
    "tool-call": ({ step, recurse, seen }) => recurse(step.nextStepId, seen),
    end: () => 0,
    sleep: ({ step, recurse, seen }) => recurse(step.nextStepId, seen),
    start: ({ step, recurse, seen }) => recurse(step.nextStepId, seen),
    "wait-for-condition": ({ step, recurse, seen }) =>
        Math.max(
            recurse(step.nextStepId, seen),
            ...nestedChainEntryPoints(step).map((entry) =>
                recurse(entry, seen),
            ),
        ),
};

function calculateNestingDepth(
    workflow: WorkflowDefinition,
    stepId: string | undefined = workflow.initialStepId,
    seen = new Set<string>(),
): number {
    if (!stepId || seen.has(stepId)) return 0;
    const step = workflow.steps.find((s) => s.id === stepId);
    if (!step) return 0;
    seen.add(stepId);

    const reducer = NESTING_DEPTH_REDUCERS[
        step.type
    ] as NestingDepthReducer<StepType>;
    return reducer({
        workflow,
        step,
        seen,
        recurse: (nextId, nextSeen) =>
            calculateNestingDepth(workflow, nextId, nextSeen),
    });
}

void assertNeverStep;

export const structuralLimitValidator: ValidationModule = {
    id: "structural-limit",
    failureMode: "block",
    validate: (workflowDefinition, { options }) => {
        const diagnostics: ValidatorDiagnostic[] = [];

        const stepCount = workflowDefinition.steps.length;
        if (
            options.structuralLimits.maxSteps > 0 &&
            stepCount > options.structuralLimits.maxSteps
        ) {
            diagnostics.push({
                severity: "error",
                path: ["steps"],
                message: `Workflow contains ${stepCount} steps, but the maximum step count is ${options.structuralLimits.maxSteps}.`,
            });
        }

        const nestingDepth = calculateNestingDepth(workflowDefinition);
        if (
            options.structuralLimits.maxNestingDepth > 0 &&
            nestingDepth > options.structuralLimits.maxNestingDepth
        ) {
            diagnostics.push({
                severity: "error",
                path: ["steps"],
                message: `Workflows must not have a nesting depth greater than ${options.structuralLimits.maxNestingDepth}, but definition given has a depth of ${nestingDepth}.`,
            });
        }

        return { diagnostics };
    },
};

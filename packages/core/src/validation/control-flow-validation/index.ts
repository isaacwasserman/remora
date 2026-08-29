import type { WorkflowDefinition, WorkflowStep } from "../../schema";
import { nestedChainEntryPoints, nestedChains } from "../../step-registry";
import { buildStepIndex } from "../../utils";
import type { ValidationModule, ValidatorDiagnostic } from "../types";
import { workflowHasCycles } from "./cycle-detection";
import { validateStepReferences } from "./step-reference-validation";

function traverse(
    stepsById: Map<string, WorkflowStep>,
    startStepId: string,
): string[] {
    const currentStep = stepsById.get(startStepId) as WorkflowStep;
    return [
        startStepId,
        ...nestedChainEntryPoints(currentStep).flatMap((entryPointStepId) =>
            traverse(stepsById, entryPointStepId),
        ),
        ...(currentStep.nextStepId
            ? traverse(stepsById, currentStep.nextStepId)
            : []),
    ];
}

function identifyOrphanSteps(workflowDefinition: WorkflowDefinition): string[] {
    const stepsById = buildStepIndex(workflowDefinition);
    const visited = new Set(
        traverse(stepsById, workflowDefinition.initialStepId),
    );
    const allSteps = new Set(workflowDefinition.steps.map((step) => step.id));
    const orphans = allSteps.difference(visited);
    return Array.from(orphans);
}

function validateNoOrphans(
    workflowDefinition: WorkflowDefinition,
): ValidatorDiagnostic[] {
    const orphans = identifyOrphanSteps(workflowDefinition);
    return orphans.map((orphanStepId) => ({
        severity: "error",
        path: [
            "steps",
            workflowDefinition.steps.findIndex(
                (step) => step.id === orphanStepId,
            ) as number,
        ],
        message: `Step "${orphanStepId}" is unreachable. All steps must be reachable.`,
    }));
}

function chainTerminal(
    stepsById: Map<string, WorkflowStep>,
    startStepId: string,
): WorkflowStep {
    let current = stepsById.get(startStepId) as WorkflowStep;
    const seen = new Set<string>();
    while (current.nextStepId && !seen.has(current.id)) {
        seen.add(current.id);
        current = stepsById.get(current.nextStepId) as WorkflowStep;
    }
    return current;
}

export function validateBlockTermination(
    workflowDefinition: WorkflowDefinition,
): ValidatorDiagnostic[] {
    const stepsById = buildStepIndex(workflowDefinition);
    const diagnostics: ValidatorDiagnostic[] = [];
    const stepIndexById = (stepId: string): number =>
        workflowDefinition.steps.findIndex((step) => step.id === stepId);

    const warnIfNotEndTerminated = (
        startStepId: string,
        path: ValidatorDiagnostic["path"],
        blockDescription: string,
    ) => {
        const terminal = chainTerminal(stepsById, startStepId);
        if (terminal.type === "end") return;
        // A chain ending in a switch-case delegates termination to its branch
        // bodies, which are each validated on their own.
        if (terminal.type === "switch-case") return;
        diagnostics.push({
            severity: "warning",
            path,
            message: `${blockDescription} does not terminate with an "end" step. It should end in an "end" step (optionally producing an output) so it contributes an output.`,
        });
    };

    warnIfNotEndTerminated(
        workflowDefinition.initialStepId,
        ["steps", stepIndexById(workflowDefinition.initialStepId)],
        "The workflow",
    );

    for (const [stepIndex, step] of workflowDefinition.steps.entries()) {
        for (const chain of nestedChains(step)) {
            if (!chain.contributesOutput) continue;
            warnIfNotEndTerminated(
                chain.entryPointStepId,
                ["steps", stepIndex, ...chain.path],
                chain.description.charAt(0).toUpperCase() +
                    chain.description.slice(1),
            );
        }
    }
    return diagnostics;
}

export function validateControlFlow(
    workflowDefinition: WorkflowDefinition,
): ValidatorDiagnostic[] {
    const stepsById = buildStepIndex(workflowDefinition);
    const diagnostics: ValidatorDiagnostic[] = [];

    const { diagnostics: stepReferenceDiagnostics } =
        validateStepReferences(workflowDefinition);
    if (stepReferenceDiagnostics.length > 0) {
        return stepReferenceDiagnostics;
    }

    const initialStep = stepsById.get(workflowDefinition.initialStepId);
    if (initialStep && initialStep.type !== "start") {
        diagnostics.push({
            severity: "warning",
            path: ["initialStepId"],
            message: `The initial step "${workflowDefinition.initialStepId}" is of type "${initialStep.type}", not "start". A "start" step is recommended as the entry point.`,
        });
    }

    const { diagnostics: cycleDetectionDiagnostics } =
        workflowHasCycles(workflowDefinition);
    if (cycleDetectionDiagnostics.length > 0) {
        return [...diagnostics, ...cycleDetectionDiagnostics];
    }

    const orphanDiagnostics = validateNoOrphans(workflowDefinition);
    if (orphanDiagnostics.length > 0) {
        return [...diagnostics, ...orphanDiagnostics];
    }

    return [...diagnostics, ...validateBlockTermination(workflowDefinition)];
}

export const controlFlowValidator: ValidationModule = {
    id: "control-flow",
    failureMode: "block",
    validate: (workflowDefinition) => {
        const diagnostics = validateControlFlow(workflowDefinition);
        return { diagnostics };
    },
};

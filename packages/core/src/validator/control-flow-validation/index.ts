import type { WorkflowDefinition, WorkflowStep } from "../../schema";
import { buildStepIndex } from "../../utils";
import type { ValidationModule, ValidatorDiagnostic } from "../types";
import { workflowHasCycles } from "./cycle-detection";
import { validateStepReferences } from "./step-reference-validation";

function traverse(
    stepsById: Map<string, WorkflowStep>,
    startStepId: string,
): string[] {
    const currentStep = stepsById.get(startStepId) as WorkflowStep;
    switch (currentStep.type) {
        case "for-each": {
            return [
                ...traverse(stepsById, currentStep.params.loopBodyStepId),
                ...(currentStep.nextStepId
                    ? traverse(stepsById, currentStep.nextStepId)
                    : []),
            ];
        }
        case "switch-case": {
            return [
                ...currentStep.params.cases.flatMap((branchCase) =>
                    traverse(stepsById, branchCase.branchBodyStepId),
                ),
                ...(currentStep.nextStepId
                    ? traverse(stepsById, currentStep.nextStepId)
                    : []),
            ];
        }
        default: {
            return currentStep.nextStepId
                ? traverse(stepsById, currentStep.nextStepId)
                : [];
        }
    }
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

export function validateControlFlow(
    workflowDefinition: WorkflowDefinition,
): ValidatorDiagnostic[] {
    const { diagnostics: stepReferenceDiagnostics } =
        validateStepReferences(workflowDefinition);
    if (stepReferenceDiagnostics.length > 0) {
        return stepReferenceDiagnostics;
    }

    const { diagnostics: cycleDetectionDiagnostics } =
        workflowHasCycles(workflowDefinition);
    if (cycleDetectionDiagnostics.length > 0) {
        return cycleDetectionDiagnostics;
    }

    return validateNoOrphans(workflowDefinition);
}

export const controlFlowValidator: ValidationModule = {
    id: "control-flow",
    failureMode: "block",
    validate: (workflowDefinition) => {
        const diagnostics = validateControlFlow(workflowDefinition);
        return {diagnostics};
    }
}
import type { WorkflowDefinition, WorkflowStep } from "../../schema";
import { buildStepIndex } from "../../utils";
import type { ValidatorError } from "../types";

type TraverseResult =
    | { success: true }
    | {
          success: false;
          error: {
              message: string;
              problemStepId: string;
          };
      };

function traverseWorkflow(
    stepsById: Map<string, WorkflowStep>,
    currentStepId: string,
    ancestors: Set<string>,
    fullyExplored: Set<string>,
): TraverseResult {
    if (ancestors.has(currentStepId)) {
        return {
            success: false,
            error: {
                problemStepId: currentStepId,
                message: `Workflow graph contains a cycle. Step "${currentStepId}" is visited more than once.`,
            },
        };
    }
    if (fullyExplored.has(currentStepId)) {
        return { success: true }; // already verified cycle-free from here
    }
    const currentStep = stepsById.get(currentStepId) as WorkflowStep;
    const nextAncestors = new Set(ancestors).add(currentStepId);

    switch (currentStep.type) {
        case "switch-case": {
            for (const branchCase of currentStep.params.cases) {
                const result = traverseWorkflow(
                    stepsById,
                    branchCase.branchBodyStepId,
                    nextAncestors,
                    fullyExplored,
                );
                if (!result.success) return result;
            }
            break;
        }
        case "for-each": {
            const result = traverseWorkflow(
                stepsById,
                currentStep.params.loopBodyStepId,
                nextAncestors,
                fullyExplored,
            );
            if (!result.success) return result;
            break;
        }
    }

    if (currentStep.nextStepId) {
        const result = traverseWorkflow(
            stepsById,
            currentStep.nextStepId,
            nextAncestors,
            fullyExplored,
        );
        if (!result.success) return result;
    }

    fullyExplored.add(currentStepId);
    return { success: true };
}

export function workflowHasCycles(workflowDefinition: WorkflowDefinition): {
    diagnostics: ValidatorError[];
} {
    const stepsById = buildStepIndex(workflowDefinition);
    const result = traverseWorkflow(
        stepsById,
        workflowDefinition.initialStepId,
        new Set(),
        new Set(),
    );
    if (!result.success) {
        const problemStep = stepsById.get(
            result.error.problemStepId,
        ) as WorkflowStep & { index: number };
        return {
            diagnostics: [
                {
                    severity: "error",
                    path: ["steps", problemStep.index],
                    message: result.error.message,
                },
            ],
        };
    }
    return { diagnostics: [] };
}

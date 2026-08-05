import type { WorkflowDefinition } from "../../schema";
import { evaluateExpressionAgainstScope } from "../expressions/expression";
import { _executeWorkflow } from "../run-workflow";
import type { StepExecutionUpdate, StepExecutor } from "../types";
import { stepIndex } from "./shared";

export const switchCaseExecutor: StepExecutor<"switch-case"> = {
    stepType: "switch-case",
    errorCode: "UNKNOWN",
    execute: async function* ({
        step,
        scope,
        workflowDefinition,
        tools,
        model,
        settings,
        approvalPolicies,
        executionContext,
        userInterventionContext,
        uniqueStepIdPath,
    }) {
        const branchingValue = evaluateExpressionAgainstScope(
            step.params.switchOn,
            scope,
        );
        const matchedCaseIndex = step.params.cases.findIndex(
            (branchCase) =>
                branchCase.value.type !== "default" &&
                branchingValue ===
                    evaluateExpressionAgainstScope(branchCase.value, scope),
        );
        const selectedCaseIndex =
            matchedCaseIndex !== -1
                ? matchedCaseIndex
                : step.params.cases.findIndex(
                      (branchCase) => branchCase.value.type === "default",
                  );
        const selectedCase = step.params.cases[selectedCaseIndex];
        if (!selectedCase) {
            yield {
                scope: null,
                output: null,
                error: {
                    code: "UNRECOGNIZED_CASE",
                    path: ["steps", stepIndex(workflowDefinition, step.id)],
                    message: `Switch-case step with id "${step.id}" branches on ${JSON.stringify(step.params.switchOn)}, but this evaluated to "${branchingValue} for which there was no case defined and no default case given."`,
                },
            };
            return;
        }
        const subworkflowDefinition: WorkflowDefinition = {
            ...workflowDefinition,
            initialStepId: selectedCase.branchBodyStepId,
        };
        let lastUpdate: StepExecutionUpdate | undefined;
        for await (const update of _executeWorkflow({
            workflowDefinition: subworkflowDefinition,
            initialScope: scope,
            tools,
            model,
            executionContext,
            userInterventionContext,
            settings,
            approvalPolicies,
            uniqueStepIdPath: [...uniqueStepIdPath, String(selectedCaseIndex)],
        })) {
            if (update.error) {
                yield { scope: null, output: null, error: update.error };
                return;
            }
            yield update;
            lastUpdate = update;
        }
        const branchScope = lastUpdate?.scope ?? scope;
        yield {
            scope: { ...scope, ...branchScope },
            output: null,
            error: null,
        };
    },
};

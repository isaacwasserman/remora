import type { WorkflowDefinition } from "../../schema";
import { LoopIterationLimitExceededError } from "../execution-engine/errors";
import { evaluateExpressionAgainstScope } from "../expressions/expression";
import { _executeWorkflow } from "../run-workflow";
import type {
    ExecutionScope,
    StepExecutionUpdate,
    StepExecutor,
} from "../types";

export const forEachExecutor: StepExecutor<"for-each"> = {
    stepType: "for-each",
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
        const subworkflowDefinition: WorkflowDefinition = {
            ...workflowDefinition,
            initialStepId: step.params.loopBodyStepId,
        };
        const iterator = evaluateExpressionAgainstScope(
            step.params.target,
            scope,
        ) as unknown[];
        const loopOutput: unknown[] = [];

        const { maxLoopIterations } = settings.structuralLimits;
        if (maxLoopIterations > 0 && iterator.length > maxLoopIterations) {
            throw new LoopIterationLimitExceededError(
                step.id,
                iterator.length,
                maxLoopIterations,
            );
        }

        for (const [iteratorIndex, iteratorElement] of iterator.entries()) {
            const loopBodyStartScope: ExecutionScope = {
                ...scope,
                [step.params.itemName]: iteratorElement,
            };
            let lastUpdate: StepExecutionUpdate | undefined;
            for await (const update of _executeWorkflow({
                workflowDefinition: subworkflowDefinition,
                initialScope: loopBodyStartScope,
                tools,
                model,
                executionContext,
                userInterventionContext,
                settings,
                approvalPolicies,
                uniqueStepIdPath: [...uniqueStepIdPath, String(iteratorIndex)],
            })) {
                if (update.error) {
                    yield {
                        scope: null,
                        output: null,
                        error: update.error,
                    };
                    return;
                }
                yield update;
                lastUpdate = update;
            }
            loopOutput.push(lastUpdate?.output ?? null);
        }
        yield {
            scope: { ...scope, [step.id]: loopOutput },
            output: null,
            error: null,
        };
    },
};

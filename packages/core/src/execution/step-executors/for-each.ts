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
        const subworkflowDefinition: WorkflowDefinition = {
            ...workflowDefinition,
            initialStepId: step.params.loopBodyStepId,
        };
        const iterator = evaluateExpressionAgainstScope(
            step.params.target,
            scope,
        ) as unknown[];
        const loopOutput: unknown[] = [];
        let lastUpdate: StepExecutionUpdate | undefined;

        const hasAccumulator = step.params.accumulatorName !== undefined;
        let accumulator: unknown = hasAccumulator
            ? evaluateExpressionAgainstScope(
                  // biome-ignore lint/style/noNonNullAssertion: <explanation>
                  step.params.accumulatorInitialValue!,
                  scope,
              )
            : undefined;

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
                ...(hasAccumulator
                    ? // biome-ignore lint/style/noNonNullAssertion: <explanation>
                      { [step.params.accumulatorName!]: accumulator }
                    : {}),
            };
            let iterationLastUpdate: StepExecutionUpdate | undefined;
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
                iterationLastUpdate = update;
            }
            if (hasAccumulator) {
                accumulator = iterationLastUpdate?.output ?? null;
            } else {
                loopOutput.push(iterationLastUpdate?.output ?? null);
            }
            lastUpdate = iterationLastUpdate;
        }
        yield {
            scope: {
                ...scope,
                [step.id]: hasAccumulator ? accumulator : loopOutput,
            },
            output: null,
            error: null,
            ...(step.nextStepId
                ? {}
                : {
                      lastEndStepId: !lastUpdate?.error
                          ? lastUpdate?.lastEndStepId
                          : undefined,
                  }),
        };
    },
};

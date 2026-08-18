import type { WorkflowDefinition } from "../../schema";
import { LoopIterationLimitExceededError } from "../execution-engine/errors";
import { evaluateExpressionAgainstScope } from "../expressions/expression";
import { _executeWorkflow } from "../run-workflow";
import type {
    ExecutionScope,
    StepExecutionUpdate,
    StepExecutor,
} from "../types";

export const whileExecutor: StepExecutor<"while"> = {
    stepType: "while",
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
        const conditionChain: WorkflowDefinition = {
            ...workflowDefinition,
            initialStepId: step.params.conditionStepId,
        };
        const bodyChain: WorkflowDefinition = {
            ...workflowDefinition,
            initialStepId: step.params.loopBodyStepId,
        };

        const { maxLoopIterations } = settings.structuralLimits;
        const loopOutput: unknown[] = [];
        let iterationCount = 0;
        let lastBodyUpdate: StepExecutionUpdate | undefined;

        const hasAccumulator = step.params.accumulatorName !== undefined;
        let accumulator: unknown = hasAccumulator
            ? evaluateExpressionAgainstScope(
                  // biome-ignore lint/style/noNonNullAssertion: <explanation>
                  step.params.accumulatorInitialValue!,
                  scope,
              )
            : undefined;

        while (true) {
            const iterationScope: ExecutionScope = hasAccumulator
                ? // biome-ignore lint/style/noNonNullAssertion: <explanation>
                  { ...scope, [step.params.accumulatorName!]: accumulator }
                : scope;

            let conditionUpdate: StepExecutionUpdate | undefined;
            for await (const update of _executeWorkflow({
                workflowDefinition: conditionChain,
                initialScope: iterationScope,
                tools,
                model,
                executionContext,
                userInterventionContext,
                settings,
                approvalPolicies,
                uniqueStepIdPath: [
                    ...uniqueStepIdPath,
                    "condition",
                    String(iterationCount),
                ],
            })) {
                if (update.error) {
                    yield { scope: null, output: null, error: update.error };
                    return;
                }
                yield update;
                conditionUpdate = update;
            }

            if (!conditionUpdate?.output) break;

            if (maxLoopIterations > 0 && iterationCount >= maxLoopIterations) {
                throw new LoopIterationLimitExceededError(
                    step.id,
                    iterationCount + 1,
                    maxLoopIterations,
                );
            }

            let bodyUpdate: StepExecutionUpdate | undefined;
            for await (const update of _executeWorkflow({
                workflowDefinition: bodyChain,
                initialScope: iterationScope,
                tools,
                model,
                executionContext,
                userInterventionContext,
                settings,
                approvalPolicies,
                uniqueStepIdPath: [...uniqueStepIdPath, String(iterationCount)],
            })) {
                if (update.error) {
                    yield { scope: null, output: null, error: update.error };
                    return;
                }
                yield update;
                bodyUpdate = update;
            }
            if (hasAccumulator) {
                accumulator = bodyUpdate?.output ?? null;
            } else {
                loopOutput.push(bodyUpdate?.output ?? null);
            }
            lastBodyUpdate = bodyUpdate;
            iterationCount++;
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
                      lastEndStepId: !lastBodyUpdate?.error
                          ? lastBodyUpdate?.lastEndStepId
                          : undefined,
                  }),
        };
    },
};

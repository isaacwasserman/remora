import type { WorkflowDefinition } from "../../schema";
import { rethrowIfUnrecoverable } from "../execution-engine/errors";
import { evaluateExpressionAgainstScope } from "../expressions/expression";
import { _executeWorkflow } from "../run-workflow";
import type { ExecutionScope, StepExecutor } from "../types";
import { stepIndex } from "./shared";

export const waitForConditionExecutor: StepExecutor<"wait-for-condition"> = {
    stepType: "wait-for-condition",
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
        const evalNumber = (
            expression: (typeof step.params)["maxAttempts"],
            fallback: number,
        ): number =>
            expression
                ? Number(evaluateExpressionAgainstScope(expression, scope))
                : fallback;

        const maxAttempts = evalNumber(step.params.maxAttempts, 10);
        const intervalMs = evalNumber(step.params.intervalMs, 1000);
        const backoffMultiplier = evalNumber(step.params.backoffMultiplier, 1);
        const timeoutMs = step.params.timeoutMs
            ? Number(
                  evaluateExpressionAgainstScope(step.params.timeoutMs, scope),
              )
            : undefined;

        const conditionChain: WorkflowDefinition = {
            ...workflowDefinition,
            initialStepId: step.params.conditionStepId,
        };

        try {
            yield {
                scope,
                output: null,
                error: null,
                status: "awaiting-condition",
            };
            const conditionValue = yield* executionContext.waitFor(
                uniqueStepIdPath,
                async function* (attempt) {
                    let updatedScope: ExecutionScope = scope;
                    for await (const update of _executeWorkflow({
                        workflowDefinition: conditionChain,
                        initialScope: scope,
                        tools,
                        model,
                        executionContext,
                        userInterventionContext,
                        settings,
                        approvalPolicies,
                        uniqueStepIdPath: [
                            ...uniqueStepIdPath,
                            "attempt",
                            String(attempt),
                        ],
                    })) {
                        if (update.error) {
                            throw new Error(update.error.message);
                        }
                        yield update;
                        updatedScope = update.scope;
                    }
                    return evaluateExpressionAgainstScope(
                        step.params.condition,
                        updatedScope,
                    );
                },
                {
                    pollIntervalSeconds: intervalMs / 1000,
                    maxWaitSeconds:
                        timeoutMs !== undefined ? timeoutMs / 1000 : undefined,
                    maxAttempts,
                    backoffMultiplier,
                },
            );
            yield {
                scope: { ...scope, [step.id]: conditionValue },
                output: null,
                error: null,
            };
        } catch (e) {
            rethrowIfUnrecoverable(e);
            const errorMessage = e instanceof Error ? e.message : String(e);
            yield {
                scope: null,
                output: null,
                error: {
                    code: "WAIT_FOR_CONDITION_FAILED",
                    path: ["steps", stepIndex(workflowDefinition, step.id)],
                    message: `Wait-for-condition step "${step.id}" failed: "${errorMessage}".`,
                },
            };
        }
    },
};

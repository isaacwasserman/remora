import type { WorkflowDefinition, WorkflowStep } from "../schema";
import {
    type LanguageModel,
    type ToolSet,
    remoraflowSettingsSchema,
} from "../types";
import { buildStepIndex } from "../utils";
import type { ApprovalPolicy } from "./approval-policies/types";
import { UnrecoverableExecutionError } from "./execution-engine/errors";
import type { ExecutionContext, StepPath } from "./execution-engine/types";
import { stepExecutors } from "./step-executors";
import type {
    ExecutionScope,
    StepExecutionUpdate,
    StepExecutor,
} from "./types";
import type { UserInterventionContext } from "./user-intervention/types";

export async function* _executeWorkflow({
    workflowDefinition,
    initialScope,
    tools,
    model,
    settings,
    approvalPolicies,
    executionContext,
    userInterventionContext,
    uniqueStepIdPath,
}: {
    workflowDefinition: WorkflowDefinition;
    initialScope: ExecutionScope;
    tools: ToolSet;
    model: LanguageModel;
    settings: ReturnType<typeof remoraflowSettingsSchema.assert>;
    approvalPolicies: ApprovalPolicy[];
    executionContext: ExecutionContext;
    userInterventionContext: UserInterventionContext;
    uniqueStepIdPath: StepPath;
}): AsyncGenerator<StepExecutionUpdate> {
    const stepsById = buildStepIndex(workflowDefinition);
    let currentStepId: string | undefined = workflowDefinition.initialStepId;

    let scope: ExecutionScope = initialScope;

    while (currentStepId) {
        const currentStep = stepsById.get(currentStepId) as WorkflowStep & {
            index: number;
        };
        const stepExecutor = stepExecutors[currentStep.type] as StepExecutor;
        let lastUpdate: StepExecutionUpdate | undefined;
        try {
            await executionContext.assertWithinDurationBudget();
            for await (const update of stepExecutor.execute({
                uniqueStepIdPath: [...uniqueStepIdPath, currentStep.id],
                step: currentStep,
                scope,
                workflowDefinition,
                tools,
                model,
                settings,
                approvalPolicies,
                executionContext,
                userInterventionContext,
            })) {
                if (update.error) {
                    yield update;
                    return;
                }
                yield update;
                lastUpdate = update;
            }
        } catch (error) {
            if (error instanceof UnrecoverableExecutionError) {
                yield {
                    scope,
                    output: null,
                    error: {
                        code: error.code,
                        message: error.message,
                        path: ["steps", currentStep.index],
                    },
                };
                return;
            }
            const message =
                error instanceof Error ? error.message : String(error);
            yield {
                scope,
                output: null,
                error: {
                    code: stepExecutor.errorCode,
                    path: ["steps", currentStep.index],
                    message,
                },
            };
            return;
        }
        if (lastUpdate?.scope) {
            scope = lastUpdate.scope;
        }
        currentStepId = currentStep.nextStepId;
    }

    const outputStep = workflowDefinition.steps.find(
        (step) => step.type === "end" && step.id in scope,
    );
    const output = outputStep ? scope[outputStep.id] : null;

    yield { scope, output, error: null };
}

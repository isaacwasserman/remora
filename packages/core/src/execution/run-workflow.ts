import type { WorkflowDefinition, WorkflowStep } from "../schema";
import { isStepTypeAllowed } from "../step-registry";
import type {
    LanguageModel,
    remoraflowSettingsSchema,
    ToolSet,
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
    let lastEndStepId: string | undefined;

    while (currentStepId) {
        const currentStep = stepsById.get(currentStepId) as WorkflowStep & {
            index: number;
        };
        const stepPath = [...uniqueStepIdPath, currentStep.id];
        if (!isStepTypeAllowed(currentStep.type, settings.features)) {
            yield {
                scope,
                output: null,
                error: {
                    code: "INVALID_WORKFLOW",
                    path: ["steps", currentStep.index],
                    message: `Step "${currentStep.id}" has type "${currentStep.type}", which is not permitted by the current feature flags.`,
                },
                currentUniqueStepIdPath: stepPath,
            };
            return;
        }
        const stepExecutor = stepExecutors[currentStep.type] as StepExecutor;
        let lastUpdate: StepExecutionUpdate | undefined;
        try {
            await executionContext.assertWithinDurationBudget();
            yield {
                scope,
                output: null,
                error: null,
                currentUniqueStepIdPath: stepPath,
                status: "in-progress",
                started: true,
            };
            for await (const rawUpdate of stepExecutor.execute({
                uniqueStepIdPath: stepPath,
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
                const update: StepExecutionUpdate = {
                    ...rawUpdate,
                    currentUniqueStepIdPath:
                        rawUpdate.currentUniqueStepIdPath ?? stepPath,
                };
                if (update.error) {
                    yield update;
                    return;
                }
                yield update;
                if (update.state === undefined) {
                    lastUpdate = update;
                }
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
                    currentUniqueStepIdPath: stepPath,
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
                currentUniqueStepIdPath: stepPath,
            };
            return;
        }
        if (lastUpdate?.scope) {
            scope = lastUpdate.scope;
        }
        if (currentStep.type === "end") {
            lastEndStepId = currentStep.id;
        } else if (lastUpdate && !lastUpdate.error) {
            lastEndStepId = lastUpdate.lastEndStepId;
        }
        currentStepId = currentStep.nextStepId;
    }

    const output = lastEndStepId ? (scope[lastEndStepId] ?? null) : null;

    yield {
        scope,
        output,
        error: null,
        currentUniqueStepIdPath: uniqueStepIdPath,
        // Block executors run this workflow recursively. Preserve the terminal
        // end step so an enclosing executor can propagate its terminal output.
        ...(lastEndStepId ? { lastEndStepId } : {}),
    };
}

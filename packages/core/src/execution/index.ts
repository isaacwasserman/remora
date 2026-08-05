import type { WorkflowDefinition, WorkflowStep } from "../schema";
import {
    type LanguageModel,
    type ToolSet,
    remoraflowSettingsSchema,
} from "../types";
import { buildStepIndex } from "../utils";
import { validateWorkflowDefinition } from "../validation";
import type { ValidatorError } from "../validation/types";
import type { ApprovalPolicy } from "./approval-policies/types";
import { createExecutionContext } from "./execution-engine/context";
import { UnrecoverableExecutionError } from "./execution-engine/errors";
import { createInMemoryExecutionEngine } from "./execution-engine/in-memory";
import type { ExecutionContext, StepPath } from "./execution-engine/types";
import { withLogCapture } from "./logger";
import { stepExecutors } from "./step-executors";
import type {
    ExecutionOptions,
    ExecutionScope,
    ExecutionState,
    LogLine,
    StepExecutionUpdate,
    StepExecutor,
} from "./types";
import { defaultUserInterventionAdapter } from "./user-intervention/default-adapter";
import {
    createUserInverventionContext,
    type UserInterventionContext,
} from "./user-intervention/types";

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
            if (!(error instanceof UnrecoverableExecutionError)) {
                throw error;
            }
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

export async function* executeWorkflowStream({
    workflowDefinition,
    tools,
    model,
    executionOptions,
}: {
    workflowDefinition: WorkflowDefinition;
    tools: ToolSet;
    model: LanguageModel;
    executionOptions?: ExecutionOptions;
}): AsyncGenerator<ExecutionState> {
    const settings = remoraflowSettingsSchema.assert(
        executionOptions?.settings ?? {},
    );
    const approvalPolicies = executionOptions?.approvalPolicies ?? [];
    const silenceLogs = executionOptions?.silenceLogs ?? false;

    const { isValid, diagnostics: validationDiagnostics } =
        validateWorkflowDefinition(workflowDefinition, {
            tools,
            options: settings,
        });

    if (!isValid) {
        const firstError = validationDiagnostics.find(
            (diagnostic) => diagnostic.severity === "error",
        ) as ValidatorError;
        yield {
            status: "error",
            output: null,
            error: {
                code: "INVALID_WORKFLOW",
                message: firstError.message,
                path: firstError.path,
            },
            logs: [],
            scope: {},
        };
        return;
    }

    const executionEngine =
        executionOptions?.executionEngine ?? createInMemoryExecutionEngine();

    const executionContext = createExecutionContext(
        executionEngine.createRun(),
        { duration: settings.duration, retry: settings.stepRetry },
    );

    const userInterventionContext = createUserInverventionContext(
        executionOptions?.userInterventionAdapter ??
            defaultUserInterventionAdapter,
    );

    let latestUpdate: StepExecutionUpdate | null = null;
    let latestLogs: LogLine[] = [];

    try {
        for await (const captured of withLogCapture(
            () =>
                _executeWorkflow({
                    workflowDefinition,
                    tools,
                    model,
                    settings,
                    approvalPolicies,
                    initialScope: {},
                    executionContext,
                    userInterventionContext,
                    uniqueStepIdPath: [],
                }),
            {
                silence: silenceLogs,
                maxLogLineLength: settings.logLimits.maxLogLineLength,
                maxLogLines: settings.logLimits.maxLogLines,
            },
        )) {
            latestUpdate = captured.objective;
            latestLogs = captured.logs.logs;
            if (latestUpdate.error) {
                yield {
                    status: "error",
                    output: null,
                    error: latestUpdate.error,
                    logs: latestLogs,
                    scope: latestUpdate.scope ?? {},
                };
                return;
            }

            yield {
                status: latestUpdate.status ?? "in-progress",
                output: latestUpdate.output,
                error: null,
                logs: latestLogs,
                scope: latestUpdate.scope,
            };
        }
    } catch (error) {
        if (error instanceof UnrecoverableExecutionError) {
            yield {
                status: "error",
                output: null,
                error: {
                    code: error.code,
                    message: error.message,
                },
                logs: latestLogs,
                scope: latestUpdate?.scope ?? {},
            };
            return;
        }
        throw error;
    }
    yield {
        status: "success",
        output: latestUpdate?.output,
        error: null,
        logs: latestLogs,
        scope: latestUpdate?.scope ?? {},
    };
}

export async function executeWorkflow(
    ...args: Parameters<typeof executeWorkflowStream>
): Promise<ExecutionState & { status: "success" | "error" }> {
    const execution = executeWorkflowStream(...args);

    for await (const state of execution) {
        if (state.status === "success" || state.status === "error") {
            return state;
        }
    }

    throw new Error("Execution never reached a terminal state.");
}

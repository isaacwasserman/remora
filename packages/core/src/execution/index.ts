import type { WorkflowDefinition, WorkflowStep } from "../schema";
import { type AgentConfig, remoraflowSettingsSchema } from "../types";
import { buildStepIndex } from "../utils";
import { validateWorkflowDefinition } from "../validation";
import type { ValidatorError } from "../validation/types";
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
    ResolvedExecutionOptions,
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
    agentConfig,
    executionContext,
    userInterventionContext,
    executionOptions,
    uniqueStepIdPath,
}: {
    workflowDefinition: WorkflowDefinition;
    initialScope: ExecutionScope;
    agentConfig: AgentConfig;
    executionContext: ExecutionContext;
    userInterventionContext: UserInterventionContext;
    executionOptions: ResolvedExecutionOptions;
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
            // Checked here rather than before the step is resolved so an
            // overage can name the step the run refused to start.
            await executionContext.assertWithinDurationBudget();
            for await (const update of stepExecutor.execute({
                uniqueStepIdPath: [...uniqueStepIdPath, currentStep.id],
                step: currentStep,
                scope,
                workflowDefinition,
                agentConfig,
                executionContext,
                userInterventionContext,
                options: executionOptions,
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
            // Raised beneath the generator, where there is no update to yield.
            // Rejoining the update channel at the frame that knows which step
            // was running is what gives the error a `path`; a nested run's
            // enclosing block step then forwards it unchanged.
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
    agentConfig,
    executionOptions,
}: {
    workflowDefinition: WorkflowDefinition;
    agentConfig: AgentConfig;
    executionOptions: ExecutionOptions;
}): AsyncGenerator<ExecutionState> {
    // TODO: Ensure workflow input is valid if applicable
    // TODO: Ensure workflow output is valid if applicable
    const policy = remoraflowSettingsSchema.assert(
        executionOptions?.settings ?? {},
    );

    const { isValid, diagnostics: validationDiagnostics } =
        validateWorkflowDefinition(workflowDefinition, {
            tools: agentConfig.tools,
            options: policy,
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

    const silenceLogs = executionOptions?.silenceLogs ?? false;
    const resolvedExecutionOptions = {
        policies: policy,
        approvalPolicies: executionOptions?.approvalPolicies ?? [],
        executionEngine:
            executionOptions?.executionEngine ??
            createInMemoryExecutionEngine(),
        userInterventionAdapter:
            executionOptions?.userInterventionAdapter ??
            defaultUserInterventionAdapter,
    };

    const executionContext = createExecutionContext(
        resolvedExecutionOptions.executionEngine.createRun(),
        { duration: policy.duration, retry: policy.stepRetry },
    );

    const userInterventionContext = createUserInverventionContext(
        resolvedExecutionOptions.userInterventionAdapter,
    );

    let latestUpdate: StepExecutionUpdate | null = null;
    let latestLogs: LogLine[] = [];

    try {
        for await (const captured of withLogCapture(
            () =>
                _executeWorkflow({
                    workflowDefinition,
                    agentConfig,
                    executionOptions: resolvedExecutionOptions,
                    initialScope: {},
                    executionContext,
                    userInterventionContext,
                    uniqueStepIdPath: [],
                }),
            {
                silence: silenceLogs,
                maxLogLineLength:
                    resolvedExecutionOptions.policies.logLimits
                        .maxLogLineLength,
                maxLogLines:
                    resolvedExecutionOptions.policies.logLimits.maxLogLines,
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
        } else {
            throw error;
        }
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

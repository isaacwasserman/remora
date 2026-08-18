import type { WorkflowDefinition } from "../schema";
import { validateValue } from "../schemistry";
import {
    type LanguageModel,
    remoraflowSettingsSchema,
    type ToolSet,
} from "../types";
import { validateWorkflowDefinition } from "../validation";
import type { ValidatorError } from "../validation/types";
import { createExecutionContext } from "./execution-engine/context";
import { UnrecoverableExecutionError } from "./execution-engine/errors";
import { createInMemoryExecutionEngine } from "./execution-engine/in-memory";
import type { StepPath } from "./execution-engine/types";
import { withLogCapture } from "./logger";
import { _executeWorkflow } from "./run-workflow";
import type {
    ExecutionOptions,
    ExecutionState,
    LogLine,
    StepExecutionUpdate,
} from "./types";
import { defaultUserInterventionAdapter } from "./user-intervention/default-adapter";
import { createUserInverventionContext } from "./user-intervention/types";

export { _executeWorkflow } from "./run-workflow";

export async function* executeWorkflowStream({
    workflowDefinition,
    tools,
    model,
    input,
    executionOptions,
}: {
    workflowDefinition: WorkflowDefinition;
    tools: ToolSet;
    model: LanguageModel;
    input?: unknown;
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
            executionPath: [],
        };
        return;
    }

    if (workflowDefinition.inputSchema) {
        const { valid, errors } = validateValue(
            input ?? {},
            workflowDefinition.inputSchema,
        );
        if (!valid) {
            const detail = errors[0];
            yield {
                status: "error",
                output: null,
                error: {
                    code: "INVALID_INPUT",
                    message: `Workflow input does not match the input schema: ${detail?.error ?? "validation failed"}`,
                },
                logs: [],
                scope: {},
                executionPath: [],
            };
            return;
        }
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

    const initialScope = {
        [workflowDefinition.initialStepId]: input,
        ...(input !== undefined ? { input } : {}),
    };

    let latestUpdate: StepExecutionUpdate | null = null;
    let latestLogs: LogLine[] = [];
    let executionPath: StepPath[] = [];

    try {
        for await (const captured of withLogCapture(
            () =>
                _executeWorkflow({
                    workflowDefinition,
                    tools,
                    model,
                    settings,
                    approvalPolicies,
                    initialScope,
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
            executionPath = [
                ...executionPath,
                latestUpdate.currentUniqueStepIdPath,
            ];
            if (latestUpdate.error) {
                yield {
                    status: "error",
                    output: null,
                    error: latestUpdate.error,
                    logs: latestLogs,
                    scope: latestUpdate.scope ?? {},
                    executionPath,
                };
                return;
            }

            yield {
                status: latestUpdate.status ?? "in-progress",
                output: latestUpdate.output,
                error: null,
                logs: latestLogs,
                scope: latestUpdate.scope,
                executionPath,
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
                executionPath,
            };
            return;
        }
        throw error;
    }

    if (workflowDefinition.outputSchema) {
        const output = latestUpdate?.output;
        const { valid, errors } = validateValue(
            output,
            workflowDefinition.outputSchema,
        );
        if (!valid) {
            const detail = errors[0];
            yield {
                status: "error",
                output: null,
                error: {
                    code: "INVALID_OUTPUT",
                    message: `Workflow output does not match the output schema: ${detail?.error ?? "validation failed"}`,
                },
                logs: latestLogs,
                scope: latestUpdate?.scope ?? {},
                executionPath,
            };
            return;
        }
    }

    yield {
        status: "success",
        output: latestUpdate?.output,
        error: null,
        logs: latestLogs,
        scope: latestUpdate?.scope ?? {},
        executionPath,
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

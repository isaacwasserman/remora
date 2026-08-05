import type { WorkflowDefinition } from "../schema";
import {
    type LanguageModel,
    type ToolSet,
    remoraflowSettingsSchema,
} from "../types";
import { validateWorkflowDefinition } from "../validation";
import type { ValidatorError } from "../validation/types";
import { createExecutionContext } from "./execution-engine/context";
import { UnrecoverableExecutionError } from "./execution-engine/errors";
import { createInMemoryExecutionEngine } from "./execution-engine/in-memory";
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

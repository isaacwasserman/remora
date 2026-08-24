import type { WorkflowDefinition, WorkflowStep } from "../schema";
import { validateValue } from "../schemistry";
import { expressionReferences } from "../step-registry";
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
import { evaluateExpressionAgainstScope } from "./expressions/expression";
import { withLogCapture } from "./logger";
import { _executeWorkflow } from "./run-workflow";
import type {
    ExecutionOptions,
    ExecutionState,
    LogLine,
    StepExecutionRecord,
    StepExecutionUpdate,
} from "./types";
import { defaultUserInterventionAdapter } from "./user-intervention/default-adapter";
import { createUserInverventionContext } from "./user-intervention/types";

export type {
    DurationLimits,
    DurationPolicy,
} from "./execution-engine/duration-policy";
export { resolveDurationLimits } from "./execution-engine/duration-policy";
export { evaluateExpressionAgainstScope } from "./expressions/expression";
export { _executeWorkflow } from "./run-workflow";
export type {
    ExecutionOptions,
    ExecutionState,
    LogLine,
    StepExecutionRecord,
    StepExecutionUpdate,
} from "./types";
export { defaultUserInterventionAdapter } from "./user-intervention/default-adapter";
export type {
    InterventionRequest,
    InterventionResponse,
    RequestInterventionInput,
    UserInterventionAdapter,
    UserInterventionContext,
} from "./user-intervention/types";
export { createUserInverventionContext } from "./user-intervention/types";

function executionId(path: StepPath): string {
    return JSON.stringify(path);
}

function setAtPath(
    target: Record<string, unknown>,
    path: PropertyKey[],
    value: unknown,
) {
    let cursor: Record<string, unknown> | unknown[] = target;
    for (const key of path.slice(0, -1)) {
        const next = cursor[key as keyof typeof cursor];
        if (!next || typeof next !== "object") return;
        cursor = next as Record<string, unknown> | unknown[];
    }
    const last = path.at(-1);
    if (last !== undefined) {
        (cursor as Record<string, unknown>)[String(last)] = value;
    }
}

function renderParams(step: WorkflowStep, scope: Record<string, unknown>) {
    const params = (step as { params?: Record<string, unknown> }).params;
    if (!params) return undefined;
    const rendered = structuredClone(params);
    for (const reference of expressionReferences(step)) {
        if (reference.against === "nested-chain") continue;
        setAtPath(
            rendered,
            reference.path.slice(1),
            evaluateExpressionAgainstScope(reference.expression, scope),
        );
    }
    if (step.type === "request-intervention") {
        rendered.question = evaluateExpressionAgainstScope(
            step.params.question,
            scope,
        );
        rendered.choices = evaluateExpressionAgainstScope(
            step.params.choices,
            scope,
        );
    }
    return rendered;
}

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
            stepExecutions: [],
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
                stepExecutions: [],
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
    let stepExecutions: StepExecutionRecord[] = [];
    const stepsById = new Map(
        workflowDefinition.steps.map((step) => [step.id, step]),
    );

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
            const isStarted = latestUpdate.started === true;
            const invocationPath = latestUpdate.currentUniqueStepIdPath;
            const stepId = invocationPath.at(-1);
            const isStateUpdate = latestUpdate.state !== undefined;
            if (isStarted && stepId) {
                const step = stepsById.get(stepId);
                stepExecutions = [
                    ...stepExecutions,
                    {
                        executionId: executionId(invocationPath),
                        invocationPath,
                        stepId,
                        status: "running",
                        renderedParams: step
                            ? renderParams(step, latestUpdate.scope ?? {})
                            : undefined,
                        output: undefined,
                        error: null,
                        state: undefined,
                    },
                ];
            } else if (isStateUpdate && stepId) {
                const id = executionId(invocationPath);
                const recordIndex = stepExecutions.findLastIndex(
                    (record) => record.executionId === id,
                );
                if (recordIndex >= 0) {
                    const record = stepExecutions[recordIndex];
                    if (record) {
                        stepExecutions = stepExecutions.with(recordIndex, {
                            ...record,
                            state: latestUpdate.state,
                        });
                    }
                }
            } else if (!isStarted) {
                executionPath = [...executionPath, invocationPath];
                if (stepId) {
                    const id = executionId(invocationPath);
                    const recordIndex = stepExecutions.findLastIndex(
                        (record) => record.executionId === id,
                    );
                    if (recordIndex >= 0) {
                        const record = stepExecutions[recordIndex];
                        if (!record) continue;
                        const hasOutput = Object.hasOwn(
                            latestUpdate.scope ?? {},
                            stepId,
                        );
                        stepExecutions = stepExecutions.with(recordIndex, {
                            ...record,
                            status: latestUpdate.error
                                ? "failed"
                                : latestUpdate.status
                                  ? "running"
                                  : "completed",
                            output: hasOutput
                                ? latestUpdate.scope?.[stepId]
                                : undefined,
                            error: latestUpdate.error,
                        });
                    }
                }
            }
            if (latestUpdate.error) {
                yield {
                    status: "error",
                    output: null,
                    error: latestUpdate.error,
                    logs: latestLogs,
                    scope: latestUpdate.scope ?? {},
                    executionPath,
                    stepExecutions,
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
                stepExecutions,
                ...(isStarted
                    ? {
                          runningStepPath: latestUpdate.currentUniqueStepIdPath,
                      }
                    : {}),
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
                stepExecutions,
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
                stepExecutions,
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
        stepExecutions,
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

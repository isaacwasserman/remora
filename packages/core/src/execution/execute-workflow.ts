import type { WorkflowDefinition, WorkflowStep } from "../schema";
import { type AgentConfig, remoraflowOptionsSchema } from "../types";
import { buildStepIndex } from "../utils";
import { validateWorkflowDefinition } from "../validation";
import type { ValidatorError } from "../validation/types";
import { createExecutionContext } from "./execution-engine/context";
import { DurationLimitExceededError } from "./execution-engine/errors";
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
        await executionContext.assertWithinBudget();
        const currentStep = stepsById.get(currentStepId) as WorkflowStep;
        const stepExecutor = stepExecutors[currentStep.type] as StepExecutor;
        let lastUpdate: StepExecutionUpdate | undefined;
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
    runId,
}: {
    workflowDefinition: WorkflowDefinition;
    agentConfig: AgentConfig;
    executionOptions: ExecutionOptions;
    runId?: string;
}): AsyncGenerator<ExecutionState> {
    // TODO: Ensure workflow input is valid if applicable
    // TODO: Ensure workflow output is valid if applicable
    const policy = remoraflowOptionsSchema.assert(
        executionOptions?.policy ?? {},
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

    // Spreading `executionOptions` directly would let an explicitly-passed
    // `undefined` (a natural shape for an optional field) erase the default.
    const resolvedExecutionOptions = {
        policy,
        silenceLogs: executionOptions?.silenceLogs ?? false,
        executionEngine:
            executionOptions?.executionEngine ??
            createInMemoryExecutionEngine(),
        userInterventionAdapter:
            executionOptions?.userInterventionAdapter ??
            defaultUserInterventionAdapter,
    };

    const executionContext = createExecutionContext(
        resolvedExecutionOptions.executionEngine.createRun(),
        policy.durationPolicy,
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
                silence: resolvedExecutionOptions.silenceLogs,
            },
        )) {
            latestUpdate = captured.objective;
            latestLogs = captured.logs;
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
        if (!(error instanceof DurationLimitExceededError)) {
            throw error;
        }
        // Raised from inside the context rather than returned as a step
        // update, so it arrives here as a throw and has to be turned back
        // into a terminal state.
        yield {
            status: "error",
            output: null,
            error: {
                code: "DURATION_LIMIT_EXCEEDED",
                message: error.message,
            },
            logs: latestLogs,
            scope: latestUpdate?.scope ?? {},
        };
        return;
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

const _trivialWorkflow: WorkflowDefinition = {
    initialStepId: "start",
    steps: [
        {
            id: "start",
            name: "Start",
            description: "The first step",
            type: "start",
            nextStepId: "the_loop",
        },
        {
            id: "the_loop",
            name: "The loop",
            description: "Loops 3 times",
            type: "for-each",
            params: {
                target: {
                    type: "literal",
                    value: [0, 1, 2],
                },
                itemName: "iterator",
                loopBodyStepId: "loop_body",
            },
            nextStepId: "end",
        },
        {
            id: "loop_body",
            name: "Loop Body",
            description: "The loop body",
            type: "tool-call",
            params: {
                toolName: "add",
                toolInput: {
                    a: { type: "jmespath", expression: "iterator" },
                    b: { type: "jmespath", expression: "iterator" },
                },
            },
        },
        {
            id: "end",
            name: "End",
            description: "The last step",
            type: "end",
            params: {
                output: {
                    type: "jmespath",
                    expression:
                        "{ firstParam: `This is the first param`, lastParam: `This is the last param` }",
                },
            },
        },
    ],
};

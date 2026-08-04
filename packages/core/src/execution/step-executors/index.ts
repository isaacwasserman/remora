import { jsonSchemaToType } from "@ark/json-schema";
import dedent from "dedent";
import type { WorkflowDefinition, WorkflowStep } from "../../schema";
import type { AgentConfig, AnyTool, ToolSet } from "../../types";
import { _executeWorkflow } from "..";
import {
    approvalPoliciesToAISDKToolApprovalConfig,
    assertApprovalOfToolCallStep,
    resolveApprovalRequests,
} from "../approval-policies";
import { createDataPresentationResources } from "../data-comprehension";
import {
    LoopIterationLimitExceededError,
    rethrowIfUnrecoverable,
} from "../execution-engine/errors";
import { RESERVED_SEGMENT } from "../execution-engine/step-path";
import { evaluateExpressionAgainstScope } from "../expressions/expression";
import type {
    ExecutionScope,
    StepExecutionUpdate,
    StepExecutor,
} from "../types";
import {
    appendApprovalResponses,
    runLanguageModel,
    runLanguageModelTurn,
} from "./llm";
import type { ModelMessage } from "ai";
import { constrainToolSetInputs } from "./tool-constraint";
import { runTool } from "./tool-runner";

type StepExecutorMap = {
    [T in WorkflowStep["type"]]: StepExecutor<T>;
};

function resolveTools(agentConfig: AgentConfig, tools: string[]): ToolSet {
    const resolvedTools = tools.map(
        (toolName) => [toolName, agentConfig.tools[toolName]] as const,
    );
    for (const [toolName, resolvedTool] of resolvedTools) {
        if (!resolvedTool) {
            throw new Error(`Tool "${toolName}" not found in agent config.`);
        }
    }
    return Object.fromEntries(
        resolvedTools.filter((entry): entry is [string, AnyTool] => !!entry[1]),
    );
}

/** Index of a step within the workflow, for diagnostic paths. */
function stepIndex(
    workflowDefinition: WorkflowDefinition,
    stepId: string,
): number {
    return workflowDefinition.steps.findIndex((step) => step.id === stepId);
}

export const stepExecutors: StepExecutorMap = {
    "agent-loop": {
        stepType: "agent-loop",
        execute: async function* ({
            uniqueStepIdPath,
            step,
            scope,
            workflowDefinition,
            agentConfig,
            executionContext,
            userInterventionContext,
            options,
        }) {
            const maxSteps = Math.min(
                step.params.maxSteps
                    ? evaluateExpressionAgainstScope(
                          step.params.maxSteps,
                          scope,
                      )
                    : options.policies.tokenBudgetPolicy.maxAgentSteps,
                options.policies.tokenBudgetPolicy.maxAgentSteps,
            );
            try {
                const tools = resolveTools(agentConfig, step.params.tools);
                const inputConstrainedTools = constrainToolSetInputs(
                    tools,
                    step.params.inputConstraints,
                );
                const outputFormat = jsonSchemaToType(
                    step.params.outputFormat as Parameters<
                        typeof jsonSchemaToType
                    >[0],
                );
                const toolApproval =
                    options.approvalPolicies.length > 0
                        ? approvalPoliciesToAISDKToolApprovalConfig(
                              options.approvalPolicies,
                          )
                        : undefined;

                let messages: ModelMessage[] = [
                    { role: "user", content: step.params.instructions },
                ];
                let spentSteps = 0;

                for (let turn = 0; ; turn++) {
                    const remainingSteps = maxSteps - spentSteps;
                    if (remainingSteps < 1) {
                        yield {
                            scope: null,
                            output: null,
                            error: {
                                code: "AGENT_RUN_FAILED",
                                path: [
                                    "steps",
                                    stepIndex(workflowDefinition, step.id),
                                ],
                                message: `Agent exhausted its step budget of ${maxSteps}.`,
                            },
                        };
                        return;
                    }

                    const record = await executionContext.step(
                        [
                            ...uniqueStepIdPath,
                            RESERVED_SEGMENT,
                            "turn",
                            String(turn),
                        ],
                        () =>
                            runLanguageModelTurn({
                                model: agentConfig.model,
                                messages,
                                tools: inputConstrainedTools,
                                outputFormat,
                                toolApproval,
                                maxSteps: remainingSteps,
                                maxInputTokens:
                                    options.policies.tokenBudgetPolicy
                                        .maxContextTokens,
                            }),
                    );

                    spentSteps += record.modelStepsUsed;
                    messages = [...messages, ...record.turnMessages];

                    if (record.status === "complete") {
                        yield {
                            scope: { ...scope, [step.id]: record.output },
                            output: null,
                            error: null,
                        };
                        return;
                    }

                    if (
                        record.status === "step-budget-exhausted" ||
                        record.status === "stalled"
                    ) {
                        yield {
                            scope: null,
                            output: null,
                            error: {
                                code: "AGENT_RUN_FAILED",
                                path: [
                                    "steps",
                                    stepIndex(workflowDefinition, step.id),
                                ],
                                message:
                                    record.status === "stalled"
                                        ? `Agent stalled with unresolved tool calls: ${record.unresolvedToolCallIds.join(", ")}.`
                                        : `Agent exhausted its step budget of ${maxSteps}.`,
                            },
                        };
                        return;
                    }

                    if (spentSteps >= maxSteps) {
                        yield {
                            scope: null,
                            output: null,
                            error: {
                                code: "AGENT_RUN_FAILED",
                                path: [
                                    "steps",
                                    stepIndex(workflowDefinition, step.id),
                                ],
                                message:
                                    "Agent exhausted its step budget with a tool call still awaiting approval.",
                            },
                        };
                        return;
                    }

                    const turnPath = [
                        ...uniqueStepIdPath,
                        RESERVED_SEGMENT,
                        "turn",
                        String(turn),
                    ];
                    const responseParts = yield* resolveApprovalRequests({
                        scope,
                        approvals: record.approvals,
                        executionContext,
                        userInterventionContext,
                        basePath: turnPath,
                    });
                    messages = appendApprovalResponses(messages, responseParts);
                }
            } catch (e) {
                rethrowIfUnrecoverable(e);
                const errorMessage = e instanceof Error ? e.message : String(e);
                yield {
                    scope: null,
                    output: null,
                    error: {
                        code: "AGENT_RUN_FAILED",
                        path: ["steps", stepIndex(workflowDefinition, step.id)],
                        message: `Agent run failed due to an unknown error: "${errorMessage}".`,
                    },
                };
            }
        },
    },
    "request-intervention": {
        stepType: "request-intervention",
        execute: async function* ({
            uniqueStepIdPath,
            step,
            scope,
            executionContext,
            userInterventionContext,
            workflowDefinition,
        }) {
            try {
                const questionText = evaluateExpressionAgainstScope(
                    step.params.question,
                    scope,
                );
                const choicesArray = evaluateExpressionAgainstScope(
                    step.params.choices,
                    scope,
                );
                if (typeof questionText !== "string") {
                    yield {
                        scope,
                        output: null,
                        error: {
                            code: "TYPE_ERROR",
                            path: [
                                "steps",
                                stepIndex(workflowDefinition, step.id),
                                "params",
                                "question",
                            ],
                            message: `Question expression in step "${step.id}" did not resolve to a string.`,
                        },
                    };
                    return;
                }
                if (
                    !Array.isArray(choicesArray) ||
                    !choicesArray.every((item) => typeof item === "string")
                ) {
                    yield {
                        scope,
                        output: null,
                        error: {
                            code: "TYPE_ERROR",
                            path: [
                                "steps",
                                stepIndex(workflowDefinition, step.id),
                                "params",
                                "choices",
                            ],
                            message: `Choices expression in step "${step.id}" did not resolve to an array of strings.`,
                        },
                    };
                    return;
                }
                if (
                    choicesArray.length === 0 &&
                    !step.params.allowFreeResponse
                ) {
                    yield {
                        scope,
                        output: null,
                        error: {
                            code: "TYPE_ERROR",
                            path: [
                                "steps",
                                stepIndex(workflowDefinition, step.id),
                                "params",
                                "choices",
                            ],
                            message: `Choices expression in step "${step.id}" resolved to an empty array, and the step does not allow a free response, so the question would be unanswerable.`,
                        },
                    };
                    return;
                }
                // Produced inside a step so it replays: a resumed run must ask
                // about the same question id, not mint a new one.
                const questionId = await executionContext.step(
                    [...uniqueStepIdPath, RESERVED_SEGMENT, "questionId"],
                    async () => crypto.randomUUID(),
                );

                await executionContext.step(
                    [...uniqueStepIdPath, RESERVED_SEGMENT, "request"],
                    async () => {
                        const requested =
                            await userInterventionContext.requestIntervention({
                                interventionRequestId: questionId,
                                request: {
                                    type: "multiple-choice",
                                    question: questionText,
                                    choices: choicesArray,
                                    allowFreeResponse:
                                        step.params.allowFreeResponse,
                                },
                            });
                        if (requested.error) {
                            throw new Error(
                                `Could not ask the supervising user: ${requested.message}`,
                            );
                        }
                    },
                );

                yield {
                    scope,
                    output: null,
                    error: null,
                    status: "awaiting-input",
                };

                const { answer } = yield* executionContext.waitFor(
                    uniqueStepIdPath,
                    async () => {
                        const received =
                            await userInterventionContext.getResponse(
                                questionId,
                            );
                        if (received.error) {
                            throw new Error(
                                `Could not read the supervising user's answer: ${received.message}`,
                            );
                        }
                        return received.data;
                    },
                );
                yield {
                    scope: { ...scope, [step.id]: answer },
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
                        code: "ASK_SUPERVISOR_ERROR",
                        path: ["steps", stepIndex(workflowDefinition, step.id)],
                        message: `An unknown error occurred while requesting an answer from the user in step "${step.id}": "${errorMessage}".`,
                    },
                };
            }
        },
    },
    end: {
        stepType: "end",
        execute: async function* ({ step, scope }) {
            if (step.params) {
                const output = evaluateExpressionAgainstScope(
                    step.params.output,
                    scope,
                );
                yield {
                    scope: { ...scope, [step.id]: output },
                    output: null,
                    error: null,
                };
                return;
            }
            yield { scope, output: null, error: null };
        },
    },
    "extract-data": {
        stepType: "extract-data",
        execute: async function* ({
            uniqueStepIdPath,
            step,
            scope,
            executionContext,
            agentConfig,
            workflowDefinition,
            options,
        }) {
            try {
                const rawSourceData = evaluateExpressionAgainstScope(
                    step.params.sourceData,
                    scope,
                );
                const { prompt: dataPrompt, tools } =
                    createDataPresentationResources(rawSourceData, {
                        maxDataTokens:
                            options.policies.tokenBudgetPolicy.maxDataTokens,
                    });
                const prompt = dedent`
                    You are tasked with extracting information from the data below, and outputting it in a specifc format. ${Object.keys(tools).length > 0 ? "Use the information below as well as any provided tools to assist your answer." : ""}

                    <Data>
                    ${dataPrompt}
                    </Data>
                `;
                const output = await executionContext.step(
                    uniqueStepIdPath,
                    () =>
                        runLanguageModel({
                            model: agentConfig.model,
                            tools: tools as ToolSet,
                            instructions: prompt,
                            outputFormat: jsonSchemaToType(
                                step.params.outputFormat as Parameters<
                                    typeof jsonSchemaToType
                                >[0],
                            ),
                            maxSteps:
                                options.policies.tokenBudgetPolicy
                                    .maxAgentSteps,
                        }),
                );
                yield {
                    scope: { ...scope, [step.id]: output },
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
                        code: "DATA_EXTRACTION_RUN_FAILED",
                        path: ["steps", stepIndex(workflowDefinition, step.id)],
                        message: `Data extraction run failed due to an unknown error: "${errorMessage}".`,
                    },
                };
            }
        },
    },
    "for-each": {
        stepType: "for-each",
        execute: async function* ({
            step,
            scope,
            workflowDefinition,
            agentConfig,
            executionContext,
            userInterventionContext,
            options,
            uniqueStepIdPath,
        }) {
            const subworkflowDefinition: WorkflowDefinition = {
                ...workflowDefinition,
                initialStepId: step.params.loopBodyStepId,
            };
            const iterator = evaluateExpressionAgainstScope(
                step.params.target,
                scope,
            ) as unknown[];
            const loopOutput: unknown[] = [];

            const { maxLoopIterations } = options.policies.structuralLimits;
            if (maxLoopIterations > 0 && iterator.length > maxLoopIterations) {
                throw new LoopIterationLimitExceededError(
                    step.id,
                    iterator.length,
                    maxLoopIterations,
                );
            }

            for (const [iteratorIndex, iteratorElement] of iterator.entries()) {
                const loopBodyStartScope: ExecutionScope = {
                    ...scope,
                    [step.params.itemName]: iteratorElement,
                };
                let lastUpdate: StepExecutionUpdate | undefined;
                for await (const update of _executeWorkflow({
                    workflowDefinition: subworkflowDefinition,
                    initialScope: loopBodyStartScope,
                    agentConfig,
                    executionContext,
                    userInterventionContext,
                    executionOptions: options,
                    uniqueStepIdPath: [
                        ...uniqueStepIdPath,
                        String(iteratorIndex),
                    ],
                })) {
                    if (update.error) {
                        yield {
                            scope: null,
                            output: null,
                            error: update.error,
                        };
                        return;
                    }
                    yield update;
                    lastUpdate = update;
                }
                loopOutput.push(lastUpdate?.output ?? null);
            }
            yield {
                scope: { ...scope, [step.id]: loopOutput },
                output: null,
                error: null,
            };
        },
    },
    "llm-prompt": {
        stepType: "llm-prompt",
        execute: async function* ({
            uniqueStepIdPath,
            step,
            scope,
            workflowDefinition,
            agentConfig,
            executionContext,
        }) {
            try {
                const output = await executionContext.step(
                    uniqueStepIdPath,
                    () =>
                        runLanguageModel({
                            model: agentConfig.model,
                            tools: {},
                            instructions: step.params.prompt,
                            outputFormat: jsonSchemaToType(
                                step.params.outputFormat as Parameters<
                                    typeof jsonSchemaToType
                                >[0],
                            ),
                        }),
                );
                yield {
                    scope: { ...scope, [step.id]: output },
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
                        code: "LLM_RUN_FAILED",
                        path: ["steps", stepIndex(workflowDefinition, step.id)],
                        message: `LLM run failed due to an unknown error: "${errorMessage}".`,
                    },
                };
            }
        },
    },
    sleep: {
        stepType: "sleep",
        execute: async function* ({
            uniqueStepIdPath,
            step,
            scope,
            executionContext,
        }) {
            const durationMs = Number(
                evaluateExpressionAgainstScope(step.params.durationMs, scope),
            );
            yield { scope, output: null, error: null, status: "sleeping" };
            await executionContext.sleep(uniqueStepIdPath, durationMs / 1000);
            yield { scope, output: null, error: null };
        },
    },
    start: {
        stepType: "start",
        execute: async function* ({ scope }) {
            yield { scope, output: null, error: null };
        },
    },
    "switch-case": {
        stepType: "switch-case",
        execute: async function* ({
            step,
            scope,
            workflowDefinition,
            agentConfig,
            executionContext,
            userInterventionContext,
            options,
            uniqueStepIdPath,
        }) {
            const branchingValue = evaluateExpressionAgainstScope(
                step.params.switchOn,
                scope,
            );
            const matchedCaseIndex = step.params.cases.findIndex(
                (branchCase) =>
                    branchCase.value.type !== "default" &&
                    branchingValue ===
                        evaluateExpressionAgainstScope(branchCase.value, scope),
            );
            const selectedCaseIndex =
                matchedCaseIndex !== -1
                    ? matchedCaseIndex
                    : step.params.cases.findIndex(
                          (branchCase) => branchCase.value.type === "default",
                      );
            const selectedCase = step.params.cases[selectedCaseIndex];
            if (!selectedCase) {
                yield {
                    scope: null,
                    output: null,
                    error: {
                        code: "UNRECOGNIZED_CASE",
                        path: ["steps", stepIndex(workflowDefinition, step.id)],
                        message: `Switch-case step with id "${step.id}" branches on ${JSON.stringify(step.params.switchOn)}, but this evaluated to "${branchingValue} for which there was no case defined and no default case given."`,
                    },
                };
                return;
            }
            const subworkflowDefinition: WorkflowDefinition = {
                ...workflowDefinition,
                initialStepId: selectedCase.branchBodyStepId,
            };
            let lastUpdate: StepExecutionUpdate | undefined;
            for await (const update of _executeWorkflow({
                workflowDefinition: subworkflowDefinition,
                initialScope: scope,
                agentConfig,
                executionContext,
                userInterventionContext,
                executionOptions: options,
                uniqueStepIdPath: [
                    ...uniqueStepIdPath,
                    String(selectedCaseIndex),
                ],
            })) {
                if (update.error) {
                    yield { scope: null, output: null, error: update.error };
                    return;
                }
                yield update;
                lastUpdate = update;
            }
            const branchScope = lastUpdate?.scope ?? scope;
            yield {
                scope: { ...scope, ...branchScope },
                output: null,
                error: null,
            };
        },
    },
    "tool-call": {
        stepType: "tool-call",
        execute: async function* ({
            uniqueStepIdPath,
            step,
            scope,
            workflowDefinition,
            agentConfig,
            executionContext,
            options,
            userInterventionContext
        }) {
            const tools = agentConfig.tools;
            const tool = tools[step.params.toolName as keyof typeof tools];
            if (!tool) {
                yield {
                    scope: null,
                    output: null,
                    error: {
                        code: "MISSING_TOOL",
                        message: `Tool "${step.params.toolName}" could not be found in the provided toolset.`,
                    },
                };
                return;
            }
            const executionFunction = tool.execute;
            if (!executionFunction) {
                yield {
                    scope: null,
                    output: null,
                    error: {
                        code: "MISSING_TOOL_EXECUTION_FUNCTION",
                        message: `Tool "${step.params.toolName}" is missing its required execution function.`,
                    },
                };
                return;
            }
            const toolInput = Object.fromEntries(
                Object.entries(step.params.toolInput).map(
                    ([paramName, paramExpression]) => [
                        paramName,
                        evaluateExpressionAgainstScope(paramExpression, scope),
                    ],
                ),
            );

            yield* assertApprovalOfToolCallStep({
                scope,
                stepId: step.id,
                toolName: step.params.toolName,
                toolInput,
                approvalPolicies: options.approvalPolicies,
                executionContext, 
                userInterventionContext,
                uniqueStepIdPath
            })

            try {
                const toolOutput = await executionContext.step(
                    uniqueStepIdPath,
                    () =>
                        runTool(tool, toolInput, {
                            toolCallId: step.id,
                            messages: [],
                        }),
                );
                yield {
                    scope: { ...scope, [step.id]: toolOutput },
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
                        code: "TOOL_ERROR",
                        path: ["steps", stepIndex(workflowDefinition, step.id)],
                        message: `The "${step.params.toolName}" call within step "${step.id}" threw an error: "${errorMessage}".`,
                    },
                };
            }
        },
    },
    "wait-for-condition": {
        stepType: "wait-for-condition",
        execute: async function* ({
            step,
            scope,
            workflowDefinition,
            agentConfig,
            executionContext,
            userInterventionContext,
            options,
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
            const backoffMultiplier = evalNumber(
                step.params.backoffMultiplier,
                1,
            );
            const timeoutMs = step.params.timeoutMs
                ? Number(
                      evaluateExpressionAgainstScope(
                          step.params.timeoutMs,
                          scope,
                      ),
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
                            agentConfig,
                            executionContext,
                            userInterventionContext,
                            executionOptions: options,
                            // The attempt is part of the path so each poll
                            // re-runs the chain instead of replaying the first
                            // attempt's recorded step results.
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
                            timeoutMs !== undefined
                                ? timeoutMs / 1000
                                : undefined,
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
    },
};

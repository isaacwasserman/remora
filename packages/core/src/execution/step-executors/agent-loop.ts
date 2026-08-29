import { jsonSchemaToType } from "@ark/json-schema";
import type { ModelMessage } from "ai";
import { approvalPoliciesToAISDKToolApprovalConfig } from "../approval-policies";
import { RESERVED_SEGMENT } from "../execution-engine/step-path";
import { evaluateExpressionAgainstScope } from "../expressions/expression";
import { appendApprovalResponses, runLanguageModelTurn } from "../llm";
import type { StepExecutor } from "../types";
import { resolveApprovalRequests } from "./approval-gate";
import { resolveTools, stepIndex } from "./shared";
import { constrainToolSetInputs } from "./tool-constraint";

export const agentLoopExecutor: StepExecutor<"agent-loop"> = {
    stepType: "agent-loop",
    errorCode: "AGENT_RUN_FAILED",
    execute: async function* ({
        uniqueStepIdPath,
        step,
        scope,
        workflowDefinition,
        tools,
        model,
        settings,
        approvalPolicies,
        executionContext,
        userInterventionContext,
    }) {
        const maxSteps = Math.min(
            step.params.maxSteps
                ? evaluateExpressionAgainstScope(step.params.maxSteps, scope)
                : settings.tokenBudgets.maxAgentSteps,
            settings.tokenBudgets.maxAgentSteps,
        );
        const resolvedTools = resolveTools(tools, step.params.tools);
        const inputConstrainedTools = constrainToolSetInputs(
            resolvedTools,
            step.params.inputConstraints,
        );
        const outputFormat = jsonSchemaToType(
            step.params.outputFormat as Parameters<typeof jsonSchemaToType>[0],
        );
        const toolApproval =
            approvalPolicies.length > 0
                ? approvalPoliciesToAISDKToolApprovalConfig(approvalPolicies)
                : undefined;

        const resolvedInstructions = evaluateExpressionAgainstScope(
            { type: "template", template: step.params.instructions },
            scope,
        ) as string;

        let messages: ModelMessage[] = [
            { role: "user", content: resolvedInstructions },
        ];
        let spentSteps = 0;
        const turns: {
            turn: number;
            stepsUsed: number;
            turnMessages: ModelMessage[];
            status: string;
        }[] = [];

        for (let turn = 0; ; turn++) {
            const remainingSteps = maxSteps - spentSteps;
            if (remainingSteps < 1) {
                yield {
                    scope: null,
                    output: null,
                    error: {
                        code: "AGENT_RUN_FAILED",
                        path: ["steps", stepIndex(workflowDefinition, step.id)],
                        message: `Agent exhausted its step budget of ${maxSteps}.`,
                    },
                };
                return;
            }

            const record = await executionContext.step(
                [...uniqueStepIdPath, RESERVED_SEGMENT, "turn", String(turn)],
                () =>
                    runLanguageModelTurn({
                        model: model,
                        messages,
                        tools: inputConstrainedTools,
                        outputFormat,
                        toolApproval,
                        maxSteps: remainingSteps,
                        maxInputTokens: settings.tokenBudgets.maxContextTokens,
                    }),
            );

            spentSteps += record.modelStepsUsed;
            messages = [...messages, ...record.turnMessages];

            turns.push({
                turn,
                stepsUsed: spentSteps,
                turnMessages: record.turnMessages,
                status: record.status,
            });

            yield {
                scope,
                output: null,
                error: null,
                state: { turns, maxSteps },
            };

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
                        path: ["steps", stepIndex(workflowDefinition, step.id)],
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
                        path: ["steps", stepIndex(workflowDefinition, step.id)],
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
    },
};

import { evaluateExpressionAgainstScope } from "../expressions/expression";
import type { StepExecutor } from "../types";
import { assertApprovalOfToolCallStep } from "./approval-gate";
import { runTool } from "./tool-runner";

export const toolCallExecutor: StepExecutor<"tool-call"> = {
    stepType: "tool-call",
    errorCode: "TOOL_ERROR",
    execute: async function* ({
        uniqueStepIdPath,
        step,
        scope,
        tools,
        approvalPolicies,
        executionContext,
        userInterventionContext,
        settings,
    }) {
        const allTools = tools;
        const tool = allTools[step.params.toolName as keyof typeof tools];
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
            Object.entries(step.params.toolInput ?? {}).map(
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
            approvalPolicies: approvalPolicies,
            executionContext,
            userInterventionContext,
            uniqueStepIdPath,
        });

        const toolOutput = await executionContext.step(uniqueStepIdPath, () =>
            runTool(
                tool,
                toolInput,
                {
                    toolCallId: step.id,
                    messages: [],
                },
                settings.toolExecutionLimits.maxToolOutputBytes,
            ),
        );
        yield {
            scope: { ...scope, [step.id]: toolOutput },
            output: null,
            error: null,
        };
    },
};

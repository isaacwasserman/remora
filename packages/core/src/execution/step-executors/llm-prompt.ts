import { jsonSchemaToType } from "@ark/json-schema";
import { evaluateExpressionAgainstScope } from "../expressions/expression";
import { runLanguageModel } from "../llm";
import type { StepExecutor } from "../types";

export const llmPromptExecutor: StepExecutor<"llm-prompt"> = {
    stepType: "llm-prompt",
    errorCode: "LLM_RUN_FAILED",
    execute: async function* ({
        uniqueStepIdPath,
        step,
        scope,
        model,
        executionContext,
        settings,
    }) {
        const resolvedPrompt = evaluateExpressionAgainstScope(
            { type: "template", template: step.params.prompt },
            scope,
        ) as string;
        const output = await executionContext.step(uniqueStepIdPath, () =>
            runLanguageModel({
                model: model,
                tools: {},
                instructions: resolvedPrompt,
                outputFormat: jsonSchemaToType(
                    step.params.outputFormat as Parameters<
                        typeof jsonSchemaToType
                    >[0],
                ),
                maxInputTokens: settings.tokenBudgets.maxContextTokens,
            }),
        );
        yield {
            scope: { ...scope, [step.id]: output },
            output: null,
            error: null,
        };
    },
};

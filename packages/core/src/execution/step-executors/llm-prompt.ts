import { jsonSchemaToType } from "@ark/json-schema";
import type { StepExecutor } from "../types";
import { runLanguageModel } from "./llm";

export const llmPromptExecutor: StepExecutor<"llm-prompt"> = {
    stepType: "llm-prompt",
    errorCode: "LLM_RUN_FAILED",
    execute: async function* ({
        uniqueStepIdPath,
        step,
        scope,
        model,
        executionContext,
    }) {
        const output = await executionContext.step(uniqueStepIdPath, () =>
            runLanguageModel({
                model: model,
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
    },
};

import { jsonSchemaToType } from "@ark/json-schema";
import { rethrowIfUnrecoverable } from "../execution-engine/errors";
import type { StepExecutor } from "../types";
import { runLanguageModel } from "./llm";
import { stepIndex } from "./shared";

export const llmPromptExecutor: StepExecutor<"llm-prompt"> = {
    stepType: "llm-prompt",
    execute: async function* ({
        uniqueStepIdPath,
        step,
        scope,
        workflowDefinition,
        model,
        executionContext,
    }) {
        try {
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
};

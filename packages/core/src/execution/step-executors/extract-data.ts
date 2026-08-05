import { jsonSchemaToType } from "@ark/json-schema";
import dedent from "dedent";
import type { ToolSet } from "../../types";
import { createDataPresentationResources } from "../data-comprehension";
import { evaluateExpressionAgainstScope } from "../expressions/expression";
import type { StepExecutor } from "../types";
import { runLanguageModel } from "./llm";

export const extractDataExecutor: StepExecutor<"extract-data"> = {
    stepType: "extract-data",
    errorCode: "DATA_EXTRACTION_RUN_FAILED",
    execute: async function* ({
        uniqueStepIdPath,
        step,
        scope,
        executionContext,
        settings,
        model,
    }) {
        const rawSourceData = evaluateExpressionAgainstScope(
            step.params.sourceData,
            scope,
        );
        const { prompt: dataPrompt, tools } =
            createDataPresentationResources(rawSourceData, {
                maxDataTokens: settings.tokenBudgets.maxDataTokens,
            });
        const prompt = dedent`
				You are tasked with extracting information from the data below, and outputting it in a specifc format. ${Object.keys(tools).length > 0 ? "Use the information below as well as any provided tools to assist your answer." : ""}

				<Data>
				${dataPrompt}
				</Data>
			`;
        const output = await executionContext.step(uniqueStepIdPath, () =>
            runLanguageModel({
                model: model,
                tools: tools as ToolSet,
                instructions: prompt,
                outputFormat: jsonSchemaToType(
                    step.params.outputFormat as Parameters<
                        typeof jsonSchemaToType
                    >[0],
                ),
                maxSteps: settings.tokenBudgets.maxAgentSteps,
            }),
        );
        yield {
            scope: { ...scope, [step.id]: output },
            output: null,
            error: null,
        };
    },
};

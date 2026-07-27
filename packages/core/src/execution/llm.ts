import { generateText, Output, stepCountIs, type streamText } from "ai";
import type { StandardSchemaV1 } from "../schemistry";
import type { LanguageModel, ToolSet } from "../types";

export async function runLanguageModel<TOutput>({
    model,
    systemPrompt,
    instructions,
    tools,
    outputFormat,
    maxSteps = 1,
}: {
    model: LanguageModel;
    systemPrompt?: string;
    instructions: string;
    tools: ToolSet;
    outputFormat: StandardSchemaV1<TOutput>;
    maxSteps?: number;
}) {
    const result = await generateText({
        model,
        tools: tools as Parameters<typeof streamText>[0]["tools"],
        messages: [
            ...(systemPrompt
                ? [{ role: "system" as const, content: systemPrompt }]
                : []),
            { role: "user", content: instructions },
        ],
        output: Output.object({ schema: outputFormat }),
        stopWhen: stepCountIs(maxSteps),
    });

    return result.output;
}

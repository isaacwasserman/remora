import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "@remoraflow/core";

export interface LLMConfig {
    apiKey: string;
    modelId: string;
}

export function createModel(config: LLMConfig): LanguageModel {
    const provider = createOpenAI({
        apiKey: config.apiKey,
        baseURL: "https://openrouter.ai/api/v1",
    });
    return provider.chat(config.modelId);
}

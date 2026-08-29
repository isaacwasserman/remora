import { resolve } from "node:path";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel, RemoraflowSettings } from "@remoraflow/core";

export type ModelConfig = {
    provider: "openai";
    modelId: string;
    apiKey: string;
    baseURL?: string;
};

export type CliConfig = {
    model?: ModelConfig;
    settings?: RemoraflowSettings;
};

function resolveEnvValue(value: string): string {
    if (value.startsWith("$")) {
        const envName = value.slice(1);
        const envValue = process.env[envName];
        if (!envValue) {
            throw new Error(
                `Environment variable ${envName} is not set. Set it or use a literal value in your config.`,
            );
        }
        return envValue;
    }
    return value;
}

export function createModelFromConfig(config: ModelConfig): LanguageModel {
    const apiKey = resolveEnvValue(config.apiKey);
    const provider = createOpenAI({
        apiKey,
        ...(config.baseURL && { baseURL: config.baseURL }),
    });
    return provider.chat(config.modelId);
}

export async function loadConfig(
    configPath?: string,
): Promise<CliConfig | null> {
    const resolved = configPath
        ? resolve(configPath)
        : resolve(process.cwd(), ".remoraflowconfig.json");

    const file = Bun.file(resolved);
    if (!(await file.exists())) {
        if (configPath) {
            throw new Error(`Config file not found: ${resolved}`);
        }
        return null;
    }

    try {
        return (await file.json()) as CliConfig;
    } catch (e) {
        throw new Error(
            `Failed to parse config file: ${e instanceof Error ? e.message : String(e)}`,
        );
    }
}

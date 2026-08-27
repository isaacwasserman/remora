import type { WorkflowDefinition } from "@remoraflow/core";

const OPENROUTER_CONFIG_KEY = "remoraflow-demo:openrouter-config";
const LEGACY_LLM_CONFIG_KEY = "remoraflow-demo:llm-config";
const CUSTOM_WORKFLOWS_KEY = "remoraflow-demo:custom-workflows";
const ACTIVE_WORKFLOW_KEY = "remoraflow-demo:active-workflow";

export const DEFAULT_OPENROUTER_MODEL = "google/gemma-4-31b-it";

export interface OpenRouterConfig {
    apiKey: string;
    modelId: string;
    connectionMethod: "oauth" | "api-key";
}

export interface SavedWorkflow {
    name: string;
    workflow: WorkflowDefinition;
}

export function loadOpenRouterConfig(): OpenRouterConfig | null {
    try {
        const raw = localStorage.getItem(OPENROUTER_CONFIG_KEY);
        if (raw) {
            const config = JSON.parse(raw) as Partial<OpenRouterConfig>;
            if (typeof config.apiKey === "string") {
                return {
                    apiKey: config.apiKey,
                    modelId:
                        typeof config.modelId === "string" && config.modelId
                            ? config.modelId
                            : DEFAULT_OPENROUTER_MODEL,
                    connectionMethod:
                        config.connectionMethod === "oauth"
                            ? "oauth"
                            : "api-key",
                };
            }
        }

        const legacyRaw = localStorage.getItem(LEGACY_LLM_CONFIG_KEY);
        if (legacyRaw) {
            const config = JSON.parse(legacyRaw) as {
                apiKey?: unknown;
                modelId?: unknown;
            };
            if (typeof config.apiKey === "string") {
                return {
                    apiKey: config.apiKey,
                    modelId:
                        typeof config.modelId === "string" && config.modelId
                            ? config.modelId
                            : DEFAULT_OPENROUTER_MODEL,
                    connectionMethod: "api-key",
                };
            }
        }

        return null;
    } catch {
        return null;
    }
}

export function saveOpenRouterConfig(config: OpenRouterConfig): void {
    localStorage.setItem(OPENROUTER_CONFIG_KEY, JSON.stringify(config));
}

export function clearOpenRouterConfig(): void {
    localStorage.removeItem(OPENROUTER_CONFIG_KEY);
    localStorage.removeItem(LEGACY_LLM_CONFIG_KEY);
}

export function loadCustomWorkflows(): SavedWorkflow[] {
    try {
        const raw = localStorage.getItem(CUSTOM_WORKFLOWS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

export function saveCustomWorkflows(workflows: SavedWorkflow[]): void {
    localStorage.setItem(CUSTOM_WORKFLOWS_KEY, JSON.stringify(workflows));
}

export function loadActiveWorkflowKey(): string | null {
    return localStorage.getItem(ACTIVE_WORKFLOW_KEY);
}

export function saveActiveWorkflowKey(key: string): void {
    localStorage.setItem(ACTIVE_WORKFLOW_KEY, key);
}

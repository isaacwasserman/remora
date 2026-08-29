import type { WorkflowDefinition } from "@remoraflow/core";
import { decryptSecret, encryptSecret } from "./crypto.ts";

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

interface StoredOpenRouterConfig {
    apiKey: string;
    modelId: string;
    connectionMethod: "oauth" | "api-key";
    _encrypted?: boolean;
}

export interface SavedWorkflow {
    name: string;
    workflow: WorkflowDefinition;
}

export async function loadOpenRouterConfig(): Promise<OpenRouterConfig | null> {
    try {
        const raw = localStorage.getItem(OPENROUTER_CONFIG_KEY);
        if (raw) {
            const stored = JSON.parse(raw) as Partial<StoredOpenRouterConfig>;
            if (typeof stored.apiKey === "string") {
                const apiKey = stored._encrypted
                    ? await decryptSecret(stored.apiKey)
                    : stored.apiKey;
                return {
                    apiKey,
                    modelId:
                        typeof stored.modelId === "string" && stored.modelId
                            ? stored.modelId
                            : DEFAULT_OPENROUTER_MODEL,
                    connectionMethod:
                        stored.connectionMethod === "oauth"
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

export async function saveOpenRouterConfig(
    config: OpenRouterConfig,
): Promise<void> {
    const encrypted = await encryptSecret(config.apiKey);
    const stored: StoredOpenRouterConfig = {
        apiKey: encrypted,
        modelId: config.modelId,
        connectionMethod: config.connectionMethod,
        _encrypted: true,
    };
    localStorage.setItem(OPENROUTER_CONFIG_KEY, JSON.stringify(stored));
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

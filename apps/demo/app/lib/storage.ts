import type { WorkflowDefinition } from "@remoraflow/core";

const LLM_CONFIG_KEY = "remoraflow-demo:llm-config";
const CUSTOM_WORKFLOWS_KEY = "remoraflow-demo:custom-workflows";
const ACTIVE_WORKFLOW_KEY = "remoraflow-demo:active-workflow";

export interface LLMConfig {
    apiKey: string;
    modelId: string;
    baseURL?: string;
}

export interface SavedWorkflow {
    name: string;
    workflow: WorkflowDefinition;
}

export function loadLLMConfig(): LLMConfig | null {
    try {
        const raw = localStorage.getItem(LLM_CONFIG_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export function saveLLMConfig(config: LLMConfig): void {
    localStorage.setItem(LLM_CONFIG_KEY, JSON.stringify(config));
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

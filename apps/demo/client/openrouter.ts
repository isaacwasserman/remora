const API_KEY_STORAGE = "remoraflow-openrouter-key";
const MODEL_STORAGE = "remoraflow-openrouter-model";

export function loadApiKey(): string {
  return localStorage.getItem(API_KEY_STORAGE) ?? "";
}

export function saveApiKey(key: string): void {
  localStorage.setItem(API_KEY_STORAGE, key);
}

export function loadModelId(): string {
  return localStorage.getItem(MODEL_STORAGE) ?? "anthropic/claude-haiku-4.5";
}

export function saveModelId(id: string): void {
  localStorage.setItem(MODEL_STORAGE, id);
}

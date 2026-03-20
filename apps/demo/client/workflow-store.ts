import type { ExecutionState, WorkflowDefinition } from "@remoraflow/core";

const STORAGE_KEY = "remoraflow-demo-workflow";
const EXEC_STATE_PREFIX = "remoraflow-demo-exec-";

export function saveWorkflow(workflow: WorkflowDefinition): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workflow));
}

export function loadWorkflow(): WorkflowDefinition | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as WorkflowDefinition;
  } catch {
    return null;
  }
}

export function clearWorkflow(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function exportWorkflowJson(workflow: WorkflowDefinition): void {
  const blob = new Blob([JSON.stringify(workflow, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "workflow.json";
  a.click();
  URL.revokeObjectURL(url);
}

export function saveExecutionState(
  workflowHash: string,
  state: ExecutionState,
): void {
  localStorage.setItem(
    `${EXEC_STATE_PREFIX}${workflowHash}`,
    JSON.stringify(state),
  );
}

export function loadExecutionState(
  workflowHash: string,
): ExecutionState | null {
  const stored = localStorage.getItem(`${EXEC_STATE_PREFIX}${workflowHash}`);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as ExecutionState;
  } catch {
    return null;
  }
}

export function clearExecutionState(workflowHash: string): void {
  localStorage.removeItem(`${EXEC_STATE_PREFIX}${workflowHash}`);
}

/**
 * Compress a workflow definition into a base64url-encoded string suitable for URL query params.
 * Uses DeflateRaw via CompressionStream for smaller output (no zlib headers).
 */
export async function encodeWorkflowToUrl(
  workflow: WorkflowDefinition,
): Promise<string> {
  const json = JSON.stringify(workflow);
  const input = new Blob([json]);
  const cs = new CompressionStream("deflate-raw");
  const stream = input.stream().pipeThrough(cs);
  const compressed = await new Response(stream).arrayBuffer();
  // base64url encode (no padding)
  const base64 = btoa(String.fromCharCode(...new Uint8Array(compressed)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const url = new URL(window.location.href);
  url.searchParams.set("workflow", base64);
  return url.toString();
}

/**
 * Decode a workflow definition from a base64url-encoded query param.
 */
export async function decodeWorkflowFromUrl(
  encoded: string,
): Promise<WorkflowDefinition | null> {
  try {
    // base64url decode
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));

    const input = new Blob([bytes]);
    const ds = new DecompressionStream("deflate-raw");
    const stream = input.stream().pipeThrough(ds);
    const json = await new Response(stream).text();
    return JSON.parse(json) as WorkflowDefinition;
  } catch {
    return null;
  }
}

/**
 * Check the current URL for a ?workflow= query param and decode it.
 * Clears the param from the URL after reading to keep it clean.
 */
export async function loadWorkflowFromUrl(): Promise<WorkflowDefinition | null> {
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get("workflow");
  if (!encoded) return null;

  const workflow = await decodeWorkflowFromUrl(encoded);
  if (workflow) {
    // Clean the URL
    const url = new URL(window.location.href);
    url.searchParams.delete("workflow");
    window.history.replaceState({}, "", url.toString());
  }
  return workflow;
}

export function importWorkflowJson(): Promise<WorkflowDefinition | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const text = await file.text();
      try {
        resolve(JSON.parse(text) as WorkflowDefinition);
      } catch {
        resolve(null);
      }
    };
    input.click();
  });
}

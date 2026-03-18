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

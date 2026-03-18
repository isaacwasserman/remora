import type { WorkflowDefinition, WorkflowStep } from "@remoraflow/core";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearAllChildRefs,
  clearChildRef,
  getChildStepIds,
  replaceChildRef,
  setChildRef,
} from "../utils/group-refs";

export interface UseEditableWorkflowOptions {
  workflow: WorkflowDefinition | null;
  onWorkflowChange?: (workflow: WorkflowDefinition) => void;
}

export interface UseEditableWorkflowReturn {
  /** The current working copy of the workflow. */
  workingWorkflow: WorkflowDefinition | null;
  addStep: (step: WorkflowStep, afterStepId?: string) => void;
  removeStep: (stepId: string) => void;
  updateStep: (stepId: string, updates: Record<string, unknown>) => void;
  connectSteps: (sourceId: string, targetId: string) => void;
  disconnectStep: (sourceId: string) => void;
  /** Update workflow-level properties (inputSchema, outputSchema). */
  updateWorkflowMeta: (updates: Partial<WorkflowDefinition>) => void;
}

function emptyWorkflow(): WorkflowDefinition {
  return { initialStepId: "", steps: [] };
}

/**
 * Clear all incoming references to `targetId` across all steps.
 * This includes nextStepId and group child references.
 */
function clearIncomingRefs(
  steps: WorkflowStep[],
  targetId: string,
): WorkflowStep[] {
  return steps.map((s) => {
    let updated =
      s.nextStepId === targetId
        ? ({ ...s, nextStepId: undefined } as WorkflowStep)
        : s;
    updated = clearChildRef(updated, targetId);
    return updated;
  });
}

/** BFS check: can `fromId` reach `toId` through outgoing edges? */
function canReach(
  steps: WorkflowStep[],
  fromId: string,
  toId: string,
): boolean {
  const stepMap = new Map(steps.map((s) => [s.id, s]));
  const visited = new Set<string>();
  const queue = [fromId];
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined) break;
    if (id === toId) return true;
    if (visited.has(id)) continue;
    visited.add(id);
    const step = stepMap.get(id);
    if (!step) continue;
    if (step.nextStepId) queue.push(step.nextStepId);
    for (const childId of getChildStepIds(step)) queue.push(childId);
  }
  return false;
}

/**
 * Detect cycles via DFS and break them by clearing back-edges.
 * Returns the workflow unchanged if no cycles exist.
 */
function repairCycles(workflow: WorkflowDefinition): WorkflowDefinition {
  const stepMap = new Map(workflow.steps.map((s) => [s.id, s]));

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const s of workflow.steps) color.set(s.id, WHITE);

  const backEdges: Array<{ fromId: string; toId: string }> = [];

  function dfs(id: string) {
    if (!stepMap.has(id)) return;
    color.set(id, GRAY);
    const step = stepMap.get(id);
    if (!step) return;
    const succs: string[] = [];
    if (step.nextStepId) succs.push(step.nextStepId);
    for (const childId of getChildStepIds(step)) succs.push(childId);
    for (const next of succs) {
      if (!stepMap.has(next)) continue;
      const c = color.get(next);
      if (c === GRAY) {
        backEdges.push({ fromId: id, toId: next });
      } else if (c === WHITE) {
        dfs(next);
      }
    }
    color.set(id, BLACK);
  }

  for (const s of workflow.steps) {
    if (color.get(s.id) === WHITE) dfs(s.id);
  }

  if (backEdges.length === 0) return workflow;

  let steps = workflow.steps;
  for (const { fromId, toId } of backEdges) {
    steps = steps.map((s) => {
      if (s.id !== fromId) return s;
      let updated = s;
      if (updated.nextStepId === toId) {
        const { nextStepId, ...rest } = updated;
        updated = rest as WorkflowStep;
      }
      updated = clearChildRef(updated, toId);
      return updated;
    });
  }

  return { ...workflow, steps };
}

export function useEditableWorkflow({
  workflow,
  onWorkflowChange,
}: UseEditableWorkflowOptions): UseEditableWorkflowReturn {
  const [workingWorkflow, setWorkingWorkflow] =
    useState<WorkflowDefinition | null>(workflow);
  const onChangeRef = useRef(onWorkflowChange);
  onChangeRef.current = onWorkflowChange;

  // Sync external workflow prop changes
  useEffect(() => {
    setWorkingWorkflow(workflow);
  }, [workflow]);

  const emit = useCallback((next: WorkflowDefinition) => {
    const repaired = repairCycles(next);
    setWorkingWorkflow(repaired);
    onChangeRef.current?.(repaired);
  }, []);

  const addStep = useCallback(
    (step: WorkflowStep, afterStepId?: string) => {
      const wf = workingWorkflow ?? emptyWorkflow();
      const steps = [...wf.steps];
      steps.push(step);

      if (afterStepId) {
        const afterIdx = steps.findIndex((s) => s.id === afterStepId);
        if (afterIdx !== -1) {
          const afterStep = steps[afterIdx] as WorkflowStep;
          const prevNext = afterStep.nextStepId;
          steps[afterIdx] = { ...afterStep, nextStepId: step.id };
          if (prevNext && !step.nextStepId) {
            const newStepIdx = steps.findIndex((s) => s.id === step.id);
            if (newStepIdx !== -1) {
              steps[newStepIdx] = {
                ...steps[newStepIdx],
                nextStepId: prevNext,
              } as WorkflowStep;
            }
          }
        }
      }

      const initialStepId =
        wf.initialStepId || (steps.length === 1 ? step.id : wf.initialStepId);
      emit({ ...wf, steps, initialStepId });
    },
    [workingWorkflow, emit],
  );

  const removeStep = useCallback(
    (stepId: string) => {
      if (!workingWorkflow) return;

      const removedStep = workingWorkflow.steps.find((s) => s.id === stepId);
      const successor = removedStep?.nextStepId;

      const steps = workingWorkflow.steps
        .filter((s) => s.id !== stepId)
        .map((s) => {
          // Re-link predecessors to the removed step's successor
          let updated =
            s.nextStepId === stepId
              ? ({ ...s, nextStepId: successor } as WorkflowStep)
              : s;
          // Clean up group references
          updated = clearChildRef(updated, stepId);
          return updated;
        });

      let initialStepId = workingWorkflow.initialStepId;
      if (initialStepId === stepId) {
        initialStepId = successor ?? steps[0]?.id ?? "";
      }

      emit({ ...workingWorkflow, steps, initialStepId });
    },
    [workingWorkflow, emit],
  );

  const updateStep = useCallback(
    (stepId: string, updates: Record<string, unknown>) => {
      if (!workingWorkflow) return;

      const steps = workingWorkflow.steps.map((s) => {
        if (s.id !== stepId) {
          // If the ID changed, update references in other steps
          const newId = updates.id as string | undefined;
          if (newId) {
            let updated =
              s.nextStepId === stepId
                ? ({ ...s, nextStepId: newId } as WorkflowStep)
                : s;
            updated = replaceChildRef(updated, stepId, newId);
            return updated;
          }
          return s;
        }

        // Merge updates into the step
        const merged = { ...s } as Record<string, unknown>;
        for (const [key, value] of Object.entries(updates)) {
          if (key === "params" && value && typeof value === "object") {
            merged.params = {
              ...(merged.params as Record<string, unknown>),
              ...(value as Record<string, unknown>),
            };
          } else {
            merged[key] = value;
          }
        }
        return merged as WorkflowStep;
      });

      let initialStepId = workingWorkflow.initialStepId;
      const newId = updates.id as string | undefined;
      if (newId && initialStepId === stepId) {
        initialStepId = newId;
      }

      emit({ ...workingWorkflow, steps, initialStepId });
    },
    [workingWorkflow, emit],
  );

  const connectSteps = useCallback(
    (sourceId: string, targetId: string) => {
      if (!workingWorkflow) return;

      const effectiveSourceId = sourceId.startsWith("__header__")
        ? sourceId.replace("__header__", "")
        : sourceId;

      // Reject if connecting would create a cycle
      if (canReach(workingWorkflow.steps, targetId, effectiveSourceId)) return;

      // Connection from a group header → set the group's child param
      if (sourceId.startsWith("__header__")) {
        const groupId = effectiveSourceId;
        const steps = clearIncomingRefs(workingWorkflow.steps, targetId).map(
          (s) => (s.id === groupId ? setChildRef(s, targetId) : s),
        );
        emit({ ...workingWorkflow, steps });
        return;
      }

      // Regular connection: clear existing incoming refs, then set nextStepId
      const steps = clearIncomingRefs(workingWorkflow.steps, targetId).map(
        (s) =>
          s.id === sourceId
            ? ({ ...s, nextStepId: targetId } as WorkflowStep)
            : s,
      );

      emit({ ...workingWorkflow, steps });
    },
    [workingWorkflow, emit],
  );

  const disconnectStep = useCallback(
    (sourceId: string) => {
      if (!workingWorkflow) return;

      // Disconnection from a group header → clear all child refs
      if (sourceId.startsWith("__header__")) {
        const groupId = sourceId.replace("__header__", "");
        const steps = workingWorkflow.steps.map((s) =>
          s.id === groupId ? clearAllChildRefs(s) : s,
        );
        emit({ ...workingWorkflow, steps });
        return;
      }

      // Regular disconnection: remove nextStepId
      const steps = workingWorkflow.steps.map((s) => {
        if (s.id !== sourceId) return s;
        const { nextStepId, ...rest } = s;
        return rest as WorkflowStep;
      });

      emit({ ...workingWorkflow, steps });
    },
    [workingWorkflow, emit],
  );

  const updateWorkflowMeta = useCallback(
    (updates: Partial<WorkflowDefinition>) => {
      if (!workingWorkflow) return;
      emit({ ...workingWorkflow, ...updates });
    },
    [workingWorkflow, emit],
  );

  return {
    workingWorkflow,
    addStep,
    removeStep,
    updateStep,
    connectSteps,
    disconnectStep,
    updateWorkflowMeta,
  };
}

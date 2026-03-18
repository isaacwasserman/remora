/**
 * Utilities for working with group-type step child references.
 *
 * Three step types contain references to child steps:
 * - for-each      → params.loopBodyStepId
 * - switch-case   → params.cases[].branchBodyStepId
 * - wait-for-condition → params.conditionStepId
 *
 * Every mutation in the editing workflow (remove, rename, connect, disconnect)
 * needs to update these references. These helpers centralise that logic.
 */
import type { WorkflowStep } from "@remoraflow/core";

/** Step types that act as group containers with child step references. */
export const GROUP_STEP_TYPES = new Set<WorkflowStep["type"]>([
  "for-each",
  "switch-case",
  "wait-for-condition",
]);

/** Returns true if the step type can contain child step references. */
export function isGroupStep(step: WorkflowStep): boolean {
  return GROUP_STEP_TYPES.has(step.type);
}

/**
 * Get all child step IDs referenced by a group step.
 * Returns an empty array for non-group steps.
 */
export function getChildStepIds(step: WorkflowStep): string[] {
  if (step.type === "for-each") {
    return step.params.loopBodyStepId ? [step.params.loopBodyStepId] : [];
  }
  if (step.type === "switch-case") {
    return step.params.cases
      .map((c) => c.branchBodyStepId)
      .filter((id) => id !== "");
  }
  if (step.type === "wait-for-condition") {
    return step.params.conditionStepId ? [step.params.conditionStepId] : [];
  }
  return [];
}

/**
 * Clear all child references that point to `targetId`.
 * Returns a new step if any reference was cleared, otherwise returns the same step.
 */
export function clearChildRef(
  step: WorkflowStep,
  targetId: string,
): WorkflowStep {
  if (step.type === "for-each" && step.params.loopBodyStepId === targetId) {
    return {
      ...step,
      params: { ...step.params, loopBodyStepId: "" },
    } as WorkflowStep;
  }
  if (step.type === "switch-case") {
    const hasMatch = step.params.cases.some(
      (c) => c.branchBodyStepId === targetId,
    );
    if (hasMatch) {
      const cases = step.params.cases.map((c) =>
        c.branchBodyStepId === targetId ? { ...c, branchBodyStepId: "" } : c,
      );
      return {
        ...step,
        params: { ...step.params, cases },
      } as WorkflowStep;
    }
  }
  if (
    step.type === "wait-for-condition" &&
    step.params.conditionStepId === targetId
  ) {
    return {
      ...step,
      params: { ...step.params, conditionStepId: "" },
    } as WorkflowStep;
  }
  return step;
}

/**
 * Clear ALL child references (used when disconnecting a group header).
 * Returns a new step with all child refs set to empty.
 */
export function clearAllChildRefs(step: WorkflowStep): WorkflowStep {
  if (step.type === "for-each") {
    return {
      ...step,
      params: { ...step.params, loopBodyStepId: "" },
    } as WorkflowStep;
  }
  if (step.type === "switch-case") {
    const cases = step.params.cases.map((c) => ({
      ...c,
      branchBodyStepId: "",
    }));
    return {
      ...step,
      params: { ...step.params, cases },
    } as WorkflowStep;
  }
  if (step.type === "wait-for-condition") {
    return {
      ...step,
      params: { ...step.params, conditionStepId: "" },
    } as WorkflowStep;
  }
  return step;
}

/**
 * Replace references from `oldId` to `newId`.
 * Returns a new step if any reference was replaced, otherwise returns the same step.
 */
export function replaceChildRef(
  step: WorkflowStep,
  oldId: string,
  newId: string,
): WorkflowStep {
  if (step.type === "for-each" && step.params.loopBodyStepId === oldId) {
    return {
      ...step,
      params: { ...step.params, loopBodyStepId: newId },
    } as WorkflowStep;
  }
  if (step.type === "switch-case") {
    const hasMatch = step.params.cases.some(
      (c) => c.branchBodyStepId === oldId,
    );
    if (hasMatch) {
      const cases = step.params.cases.map((c) =>
        c.branchBodyStepId === oldId ? { ...c, branchBodyStepId: newId } : c,
      );
      return {
        ...step,
        params: { ...step.params, cases },
      } as WorkflowStep;
    }
  }
  if (
    step.type === "wait-for-condition" &&
    step.params.conditionStepId === oldId
  ) {
    return {
      ...step,
      params: { ...step.params, conditionStepId: newId },
    } as WorkflowStep;
  }
  return step;
}

/**
 * Set a child reference on a group step, connecting it to `targetId`.
 * For switch-case, assigns to the first empty case slot.
 * Returns a new step if modified, otherwise returns the same step.
 */
export function setChildRef(
  step: WorkflowStep,
  targetId: string,
): WorkflowStep {
  if (step.type === "for-each") {
    return {
      ...step,
      params: { ...step.params, loopBodyStepId: targetId },
    } as WorkflowStep;
  }
  if (step.type === "switch-case") {
    let assigned = false;
    const cases = step.params.cases.map((c) => {
      if (!assigned && c.branchBodyStepId === "") {
        assigned = true;
        return { ...c, branchBodyStepId: targetId };
      }
      return c;
    });
    return {
      ...step,
      params: { ...step.params, cases },
    } as WorkflowStep;
  }
  if (step.type === "wait-for-condition") {
    return {
      ...step,
      params: { ...step.params, conditionStepId: targetId },
    } as WorkflowStep;
  }
  return step;
}

/**
 * Compute a structural key fragment for a step's group child references.
 * Used for the structural-change fingerprint that determines whether layout
 * needs a full rebuild.
 */
export function groupStructuralKey(step: WorkflowStep): string {
  if (step.type === "for-each") {
    return `:loop=${step.params.loopBodyStepId}`;
  }
  if (step.type === "switch-case") {
    return `:cases=${step.params.cases.map((c) => c.branchBodyStepId).join(",")}`;
  }
  if (step.type === "wait-for-condition") {
    return `:cond=${step.params.conditionStepId}`;
  }
  return "";
}

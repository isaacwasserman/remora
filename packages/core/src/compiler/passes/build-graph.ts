import type { WorkflowDefinition } from "../../types";
import type { Diagnostic, ExecutionGraph } from "../types";
import {
  buildStepIndex,
  computeLoopScopesAndOwnership,
  computePredecessors,
  computeReachability,
  computeSuccessors,
  detectCycles,
  topologicalSort,
} from "../utils/graph";

export function buildGraph(workflow: WorkflowDefinition): {
  graph: ExecutionGraph | null;
  diagnostics: Diagnostic[];
} {
  const diagnostics: Diagnostic[] = [];

  // Validate step ID format
  const VALID_STEP_ID = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  for (const step of workflow.steps) {
    if (!VALID_STEP_ID.test(step.id)) {
      diagnostics.push({
        severity: "error",
        location: { stepId: step.id, field: "id" },
        message: `Step ID '${step.id}' is invalid — must match [a-zA-Z_][a-zA-Z0-9_]* (use underscores, not hyphens)`,
        code: "INVALID_STEP_ID",
      });
    }
  }

  // Validate itemName format and shadowing
  const stepIdSet = new Set(workflow.steps.map((s) => s.id));
  for (const step of workflow.steps) {
    if (step.type === "for-each") {
      const { itemName } = step.params;
      if (!VALID_STEP_ID.test(itemName)) {
        diagnostics.push({
          severity: "error",
          location: { stepId: step.id, field: "params.itemName" },
          message: `Item name '${itemName}' is invalid — must match [a-zA-Z_][a-zA-Z0-9_]*`,
          code: "INVALID_ITEM_NAME",
        });
      }
      if (stepIdSet.has(itemName)) {
        diagnostics.push({
          severity: "warning",
          location: { stepId: step.id, field: "params.itemName" },
          message: `Item name '${itemName}' shadows step ID '${itemName}' — references to '${itemName}' inside the loop body will resolve to the loop variable, not the step output`,
          code: "ITEM_NAME_SHADOWS_STEP_ID",
        });
      }
    }
  }

  // Build step index, detect duplicates
  const { index: stepIndex, duplicates } = buildStepIndex(workflow.steps);
  for (const dupId of duplicates) {
    diagnostics.push({
      severity: "error",
      location: { stepId: dupId, field: "id" },
      message: `Duplicate step ID '${dupId}'`,
      code: "DUPLICATE_STEP_ID",
    });
  }

  // Check initialStepId exists
  if (!stepIndex.has(workflow.initialStepId)) {
    diagnostics.push({
      severity: "error",
      location: { stepId: null, field: "initialStepId" },
      message: `Initial step '${workflow.initialStepId}' does not exist`,
      code: "MISSING_INITIAL_STEP",
    });
    // Can't build a graph without a valid initial step
    return { graph: null, diagnostics };
  }

  // If there are duplicate IDs, the step index is unreliable
  if (duplicates.length > 0) {
    return { graph: null, diagnostics };
  }

  const successors = computeSuccessors(stepIndex);

  // Detect cycles
  const cycles = detectCycles(stepIndex, successors);
  for (const cycle of cycles) {
    const firstStep = cycle[0];
    if (!firstStep) continue;
    diagnostics.push({
      severity: "error",
      location: { stepId: firstStep, field: "nextStepId" },
      message: `Cycle detected: ${cycle.join(" → ")} → ${firstStep}`,
      code: "CYCLE_DETECTED",
    });
  }

  // Compute reachability
  const reachableSteps = computeReachability(
    workflow.initialStepId,
    successors,
  );

  // Warn about unreachable steps
  for (const [id] of stepIndex) {
    if (!reachableSteps.has(id)) {
      diagnostics.push({
        severity: "warning",
        location: { stepId: id, field: "id" },
        message: `Step '${id}' is not reachable from initial step '${workflow.initialStepId}'`,
        code: "UNREACHABLE_STEP",
      });
    }
  }

  // If cycles exist, we can't compute topological order or predecessors
  if (cycles.length > 0) {
    return { graph: null, diagnostics };
  }

  // Compute topological order
  const reachableIds = [...reachableSteps];
  const topologicalOrder = topologicalSort(reachableIds, successors);
  if (!topologicalOrder) {
    // Shouldn't happen since we already checked for cycles
    return { graph: null, diagnostics };
  }

  // Compute predecessors
  const predecessors = computePredecessors(
    topologicalOrder,
    successors,
    stepIndex,
  );

  // Compute loop variable scopes and body ownership
  const { loopVariablesInScope, bodyOwnership } = computeLoopScopesAndOwnership(
    workflow.initialStepId,
    stepIndex,
  );

  return {
    graph: {
      stepIndex,
      successors,
      predecessors,
      topologicalOrder,
      reachableSteps,
      loopVariablesInScope,
      bodyOwnership,
    },
    diagnostics,
  };
}

import type {
  Diagnostic,
  ExecutionState,
  StepExecutionRecord,
  WorkflowDefinition,
  WorkflowStep,
} from "@remoraflow/core";
import type React from "react";
import { useCallback, useMemo, useState } from "react";
import type { StepExecutionSummary } from "../execution-state";
import type { StepNodeData } from "../graph-layout";

export const EMPTY_DIAGNOSTICS: Diagnostic[] = [];

export interface SelectionState {
  selectedStep: WorkflowStep | null;
  selectedDiagnostics: Diagnostic[];
  selectedExecutionSummary: StepExecutionSummary | undefined;
  selectedExecutionRecords: StepExecutionRecord[] | undefined;
}

export function useSelectionState(opts: {
  activeWorkflow: WorkflowDefinition | null;
  activeDiagnostics: Diagnostic[];
  executionState: ExecutionState | undefined;
  onStepSelect?: (step: WorkflowStep | null, diagnostics: Diagnostic[]) => void;
}) {
  const { activeWorkflow, activeDiagnostics, executionState, onStepSelect } =
    opts;

  // Store only the selected step ID. The step object is derived from the
  // workflow so it updates in the same render cycle as workflow edits,
  // avoiding a second render that would reset input cursor positions.
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [selectedDiagnostics, setSelectedDiagnostics] =
    useState<Diagnostic[]>(EMPTY_DIAGNOSTICS);
  const [selectedExecutionSummary, setSelectedExecutionSummary] = useState<
    StepExecutionSummary | undefined
  >();
  const [selectedExecutionRecords, setSelectedExecutionRecords] = useState<
    StepExecutionRecord[] | undefined
  >();

  // Derive the full step object from the workflow.
  const selectedStep = useMemo(
    () =>
      selectedStepId
        ? (activeWorkflow?.steps.find((s) => s.id === selectedStepId) ?? null)
        : null,
    [selectedStepId, activeWorkflow],
  );

  // Public setter that accepts a step object (for API compatibility).
  const setSelectedStep = useCallback((step: WorkflowStep | null) => {
    setSelectedStepId(step?.id ?? null);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedStepId(null);
    setSelectedDiagnostics([]);
    setSelectedExecutionSummary(undefined);
    setSelectedExecutionRecords(undefined);
    onStepSelect?.(null, []);
  }, [onStepSelect]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: { id: string; data: unknown }) => {
      const data = node.data as StepNodeData;
      if (!data.step) return;
      setSelectedStepId(data.step.id);
      setSelectedDiagnostics(data.diagnostics);
      setSelectedExecutionSummary(data.executionSummary);
      setSelectedExecutionRecords(
        executionState?.stepRecords.filter(
          (r: StepExecutionRecord) => r.stepId === data.step.id,
        ),
      );
      onStepSelect?.(data.step, data.diagnostics);
    },
    [onStepSelect, executionState],
  );

  const selectStepForEditing = useCallback(
    (stepId: string) => {
      const step = activeWorkflow?.steps.find((s) => s.id === stepId);
      if (step) {
        setSelectedStepId(stepId);
        setSelectedDiagnostics(
          activeDiagnostics.filter((d) => d.location.stepId === stepId),
        );
      }
    },
    [activeWorkflow, activeDiagnostics],
  );

  return {
    selectedStep,
    selectedDiagnostics,
    selectedExecutionSummary,
    selectedExecutionRecords,
    clearSelection,
    onNodeClick,
    selectStepForEditing,
    setSelectedStep,
    setSelectedDiagnostics,
  };
}

import type {
    ExecutionState,
    ValidatorDiagnostic,
    WorkflowDefinition,
    WorkflowStep,
} from "@remoraflow/core";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { StepExecutionSummary } from "../execution-state";
import { deriveStepSummaries } from "../execution-state";
import type { StepNodeData } from "../graph-layout";

export const EMPTY_DIAGNOSTICS: ValidatorDiagnostic[] = [];

export interface SelectionState {
    selectedStep: WorkflowStep | null;
    selectedDiagnostics: ValidatorDiagnostic[];
    selectedExecutionSummary: StepExecutionSummary | undefined;
}

export function useSelectionState(opts: {
    activeWorkflow: WorkflowDefinition | null;
    activeDiagnostics: ValidatorDiagnostic[];
    executionState: ExecutionState | undefined;
    onStepSelect?: (
        step: WorkflowStep | null,
        diagnostics: ValidatorDiagnostic[],
    ) => void;
}) {
    const { activeWorkflow, activeDiagnostics, executionState, onStepSelect } =
        opts;

    const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
    const [selectedDiagnostics, setSelectedDiagnostics] =
        useState<ValidatorDiagnostic[]>(EMPTY_DIAGNOSTICS);
    const [selectedExecutionSummary, setSelectedExecutionSummary] = useState<
        StepExecutionSummary | undefined
    >();

    const selectedStep = useMemo(
        () =>
            selectedStepId
                ? (activeWorkflow?.steps.find((s) => s.id === selectedStepId) ??
                  null)
                : null,
        [selectedStepId, activeWorkflow],
    );

    const setSelectedStep = useCallback((step: WorkflowStep | null) => {
        setSelectedStepId(step?.id ?? null);
    }, []);

    // Node data is patched as execution updates arrive, but the selected node's
    // summary was previously only captured at click time. Keep it live so an
    // open detail panel follows the selected step through its execution.
    useEffect(() => {
        if (!selectedStepId || !executionState) {
            setSelectedExecutionSummary(undefined);
            return;
        }
        setSelectedExecutionSummary(
            deriveStepSummaries(executionState).get(selectedStepId),
        );
    }, [selectedStepId, executionState]);

    // Keep the open detail panel in sync with live validation. Node data is
    // patched as diagnostics change, but selected diagnostics used to remain
    // whatever they were when the node was first clicked.
    useEffect(() => {
        if (!selectedStepId || !activeWorkflow) {
            setSelectedDiagnostics(EMPTY_DIAGNOSTICS);
            return;
        }
        const stepIndex = activeWorkflow.steps.findIndex(
            (step) => step.id === selectedStepId,
        );
        setSelectedDiagnostics(
            stepIndex === -1
                ? EMPTY_DIAGNOSTICS
                : activeDiagnostics.filter(
                      (diagnostic) =>
                          diagnostic.path?.[0] === "steps" &&
                          diagnostic.path[1] === stepIndex,
                  ),
        );
    }, [activeDiagnostics, activeWorkflow, selectedStepId]);

    const clearSelection = useCallback(() => {
        setSelectedStepId(null);
        setSelectedDiagnostics([]);
        setSelectedExecutionSummary(undefined);
        onStepSelect?.(null, []);
    }, [onStepSelect]);

    const onNodeClick = useCallback(
        (_: React.MouseEvent, node: { id: string; data: unknown }) => {
            const data = node.data as StepNodeData;
            if (!data.step) return;
            setSelectedStepId(data.step.id);
            setSelectedDiagnostics(data.diagnostics);
            setSelectedExecutionSummary(data.executionSummary);
            onStepSelect?.(data.step, data.diagnostics);
        },
        [onStepSelect],
    );

    const selectStepForEditing = useCallback(
        (stepId: string) => {
            const stepIndex = activeWorkflow?.steps.findIndex(
                (step) => step.id === stepId,
            );
            if (stepIndex !== undefined && stepIndex !== -1) {
                setSelectedStepId(stepId);
                setSelectedDiagnostics(
                    activeDiagnostics.filter(
                        (diagnostic) =>
                            diagnostic.path?.[0] === "steps" &&
                            diagnostic.path[1] === stepIndex,
                    ),
                );
            }
        },
        [activeWorkflow, activeDiagnostics],
    );

    return {
        selectedStep,
        selectedDiagnostics,
        selectedExecutionSummary,
        clearSelection,
        onNodeClick,
        selectStepForEditing,
        setSelectedStep,
        setSelectedDiagnostics,
    };
}

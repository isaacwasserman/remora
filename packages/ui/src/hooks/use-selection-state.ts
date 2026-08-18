import type {
    ExecutionState,
    ValidatorDiagnostic,
    WorkflowDefinition,
    WorkflowStep,
} from "@remoraflow/core";
import type React from "react";
import { useCallback, useMemo, useState } from "react";
import type { StepExecutionSummary } from "../execution-state";
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
            const step = activeWorkflow?.steps.find((s) => s.id === stepId);
            if (step) {
                setSelectedStepId(stepId);
                setSelectedDiagnostics(
                    activeDiagnostics.filter(
                        (d) => "path" in d && d.path?.includes(stepId),
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

import type { ValidatorDiagnostic, WorkflowStep } from "@remoraflow/core";
import type { StepExecutionSummary } from "../execution-state";

export type LayoutDirection = "vertical" | "horizontal";

export interface StepNodeData {
    step: WorkflowStep;
    diagnostics: ValidatorDiagnostic[];
    hasSourceEdge?: boolean;
    inputSchema?: object;
    outputSchema?: object;
    executionSummary?: StepExecutionSummary;
    /** One-based positions where this step appears in the hovered execution trace. */
    pathSequenceIndexes?: number[];
    paused?: boolean;
    layoutDirection?: LayoutDirection;
    isInitial?: boolean;
}

export interface BuildLayoutOptions {
    nodeDimensions?: Map<string, { width: number; height: number }>;
    paused?: boolean;
    direction?: LayoutDirection;
}

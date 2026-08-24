import type { StepType } from "@remoraflow/core";
import { Handle, type NodeProps, Position } from "@xyflow/react";
import { useEditContext } from "../edit-context";
import type { StepNodeData } from "../graph-layout";
import { STEP_UI } from "../step-ui/registry";
import { toneColor } from "../step-ui/tone-styles";
import { HANDLE_CLASS_EDITING } from "./node-shell";

export function GroupContainerNode({ data }: NodeProps) {
    const { isEditing } = useEditContext();
    const {
        step,
        diagnostics,
        groupWidth,
        groupHeight,
        hasSourceEdge,
        executionSummary,
        pathSequenceIndexes,
        paused,
        layoutDirection,
    } = data as unknown as StepNodeData & {
        groupWidth?: number;
        groupHeight?: number;
    };

    const ui = STEP_UI[step.type as StepType];
    if (!ui) return null;
    const Icon = ui.icon;
    const color = toneColor(ui.tone);

    const targetPosition =
        layoutDirection === "horizontal" ? Position.Left : Position.Top;
    const sourcePosition =
        layoutDirection === "horizontal" ? Position.Right : Position.Bottom;

    const hasErrors = diagnostics.some((d) => d.severity === "error");
    const hasWarnings =
        !hasErrors && diagnostics.some((d) => d.severity === "warning");

    let ringClass = "";
    if (executionSummary) {
        switch (executionSummary.status) {
            case "running":
                ringClass = paused
                    ? "ring-2 ring-amber-400"
                    : "ring-2 ring-blue-400 animate-pulse";
                break;
            case "completed":
                ringClass = "ring-2 ring-green-400";
                break;
            case "failed":
                ringClass = "ring-2 ring-red-500";
                break;
        }
    } else {
        if (hasErrors) ringClass = "ring-2 ring-red-500";
        else if (hasWarnings) ringClass = "ring-2 ring-amber-400";
    }

    const isPathHighlighted = (pathSequenceIndexes?.length ?? 0) > 0;
    if (isPathHighlighted) {
        ringClass = "ring-2 ring-violet-500 shadow-lg shadow-violet-500/20";
    }

    return (
        <div
            className={`rounded-xl border-2 border-dashed transition-colors duration-150 ${ringClass} ${isEditing ? "group" : ""} relative`}
            style={{
                width: groupWidth,
                height: groupHeight,
                borderColor: `color-mix(in oklab, ${color} 40%, transparent)`,
                backgroundColor: `color-mix(in oklab, ${color} 5%, transparent)`,
            }}
        >
            {isPathHighlighted && (
                <span
                    className="absolute -top-2 -right-2 z-20 rounded-full bg-violet-600 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-white shadow-sm"
                    title={`Execution sequence position${pathSequenceIndexes?.length === 1 ? "" : "s"}: ${pathSequenceIndexes?.join(", ")}`}
                >
                    {pathSequenceIndexes?.join(", ")}
                </span>
            )}
            <Handle
                type="target"
                position={targetPosition}
                className={HANDLE_CLASS_EDITING}
                style={
                    isEditing
                        ? undefined
                        : { background: color, width: 10, height: 10 }
                }
            />
            <div className="px-3 py-2 flex items-center gap-2">
                <Icon className="w-3.5 h-3.5 shrink-0" style={{ color }} />
                <span
                    className="text-[10px] font-semibold uppercase tracking-wide"
                    style={{ color }}
                >
                    {ui.label}
                </span>
                <span className="text-sm font-medium truncate text-foreground">
                    {step.name}
                </span>
            </div>
            {(hasSourceEdge || isEditing) && (
                <Handle
                    type="source"
                    position={sourcePosition}
                    className={HANDLE_CLASS_EDITING}
                    style={
                        isEditing
                            ? undefined
                            : { background: color, width: 10, height: 10 }
                    }
                />
            )}
        </div>
    );
}

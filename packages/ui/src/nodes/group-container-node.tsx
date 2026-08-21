import type { StepType } from "@remoraflow/core";
import { Handle, type NodeProps, Position } from "@xyflow/react";
import { useEditContext } from "../edit-context";
import type { StepNodeData } from "../graph-layout";
import { STEP_UI } from "../step-ui/registry";
import { toneColor } from "../step-ui/tone-styles";
import { HANDLE_CLASS_EDITING } from "./node-shell";

export function GroupContainerNode({ data, selected }: NodeProps) {
    const { isEditing, onDeleteStep } = useEditContext();
    const {
        step,
        diagnostics,
        groupWidth,
        groupHeight,
        hasSourceEdge,
        executionSummary,
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
            {isEditing && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onDeleteStep(step.id);
                    }}
                    className="absolute -top-2 -right-2 z-10 w-5 h-5 rounded-full bg-muted-foreground/70 text-white text-xs flex items-center justify-center hover:bg-muted-foreground shadow-sm transition-opacity opacity-0 group-hover:opacity-100"
                    title="Delete step"
                >
                    &times;
                </button>
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

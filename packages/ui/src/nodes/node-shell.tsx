import type { ValidatorDiagnostic } from "@remoraflow/core";
import { Handle, Position } from "@xyflow/react";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useEditContext } from "../edit-context";
import type { StepExecutionSummary } from "../execution-state";
import type { LayoutDirection } from "../graph-layout";

export interface NodeShellProps {
    id: string;
    name: string;
    typeLabel: string;
    toneColor: string;
    accent: string;
    description: string;
    diagnostics: ValidatorDiagnostic[];
    icon?: ReactNode;
    children?: ReactNode;
    selected?: boolean;
    hasSourceEdge?: boolean;
    hasTargetEdge?: boolean;
    executionSummary?: StepExecutionSummary;
    pathSequenceIndexes?: number[];
    paused?: boolean;
    layoutDirection?: LayoutDirection;
    isInitial?: boolean;
}

function StatusIcon({ status, paused }: { status: string; paused?: boolean }) {
    switch (status) {
        case "running":
            if (paused) {
                return (
                    <svg
                        className="w-3.5 h-3.5 text-amber-500 shrink-0"
                        viewBox="0 0 16 16"
                        fill="currentColor"
                        aria-hidden="true"
                        role="img"
                    >
                        <title>Paused</title>
                        <rect x="3" y="2" width="4" height="12" rx="1" />
                        <rect x="9" y="2" width="4" height="12" rx="1" />
                    </svg>
                );
            }
            return (
                <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin shrink-0" />
            );
        case "completed":
            return (
                <svg
                    className="w-3.5 h-3.5 text-green-500 shrink-0"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    aria-hidden="true"
                    role="img"
                >
                    <title>Completed</title>
                    <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
                </svg>
            );
        case "failed":
            return (
                <svg
                    className="w-3.5 h-3.5 text-red-500 shrink-0"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    aria-hidden="true"
                    role="img"
                >
                    <title>Failed</title>
                    <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
                </svg>
            );
        default:
            return null;
    }
}

export const HANDLE_CLASS_EDITING =
    "!w-3 !h-3 !bg-blue-400 hover:!bg-blue-500 !border-2 !border-background";
export const HANDLE_CLASS_READONLY = "!w-2 !h-2 !bg-muted-foreground";

export function NodeShell({
    id,
    name,
    typeLabel,
    toneColor,
    accent,
    description,
    diagnostics,
    icon,
    children,
    selected,
    hasSourceEdge = false,
    hasTargetEdge = true,
    executionSummary,
    pathSequenceIndexes,
    paused,
    layoutDirection = "vertical",
    isInitial,
}: NodeShellProps) {
    const { isEditing, onDeleteStep } = useEditContext();
    const targetPosition =
        layoutDirection === "horizontal" ? Position.Left : Position.Top;
    const sourcePosition =
        layoutDirection === "horizontal" ? Position.Right : Position.Bottom;
    const hasErrors = diagnostics.some((d) => d.severity === "error");
    const hasWarnings =
        !hasErrors && diagnostics.some((d) => d.severity === "warning");

    let ringClass = "";
    let opacityClass = "";
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
            case "pending":
                opacityClass = "opacity-50";
                break;
        }
    } else {
        if (hasErrors) ringClass = "ring-2 ring-red-500";
        else if (hasWarnings) ringClass = "ring-2 ring-amber-400";
        else if (selected) ringClass = "ring-2 ring-blue-400";
    }

    const isPathHighlighted = (pathSequenceIndexes?.length ?? 0) > 0;
    if (isPathHighlighted) {
        ringClass = "ring-2 ring-violet-500 shadow-lg shadow-violet-500/20";
    }

    const hasRing =
        hasErrors ||
        hasWarnings ||
        selected ||
        !!executionSummary ||
        isPathHighlighted;
    const handleClass = isEditing
        ? HANDLE_CLASS_EDITING
        : HANDLE_CLASS_READONLY;

    return (
        <div
            className={`w-[300px] ${isEditing ? "cursor-grab active:cursor-grabbing group" : ""} relative`}
        >
            {isPathHighlighted && (
                <span
                    className="absolute -top-2 -right-2 z-20 rounded-full bg-violet-600 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-white shadow-sm"
                    title={`Execution sequence position${pathSequenceIndexes?.length === 1 ? "" : "s"}: ${pathSequenceIndexes?.join(", ")}`}
                >
                    {pathSequenceIndexes?.join(", ")}
                </span>
            )}
            {isEditing && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onDeleteStep(id);
                    }}
                    className="absolute -top-2 -right-2 z-10 w-5 h-5 rounded-full bg-muted-foreground/70 text-white text-xs flex items-center justify-center hover:bg-muted-foreground shadow-sm transition-opacity opacity-0 group-hover:opacity-100"
                    title="Delete step"
                >
                    <X className="size-3" aria-hidden="true" />
                </button>
            )}
            {(hasTargetEdge || (isEditing && hasTargetEdge !== false)) && (
                <Handle
                    type="target"
                    position={targetPosition}
                    className={handleClass}
                />
            )}
            <div
                className={`overflow-hidden rounded-lg shadow-md dark:shadow-none dark:border dark:border-border transition-shadow duration-150 bg-card ${ringClass} ${opacityClass} ${hasRing ? "" : "hover:ring-2 hover:ring-ring"}`}
            >
                <div
                    className="flex min-h-10 items-center gap-2 px-3"
                    style={{
                        backgroundColor: `color-mix(in oklab, ${accent} 14%, transparent)`,
                    }}
                >
                    {icon && (
                        <span
                            className="flex size-6 shrink-0 items-center justify-center rounded-md text-white shadow-sm"
                            style={{ backgroundColor: accent }}
                        >
                            {icon}
                        </span>
                    )}
                    <span
                        className="text-xs font-semibold uppercase tracking-wide"
                        style={{ color: toneColor }}
                    >
                        {typeLabel}
                    </span>
                    <div className="ml-auto flex items-center gap-1.5 shrink-0">
                        {isInitial && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                                Entry Point
                            </span>
                        )}
                        {executionSummary && (
                            <StatusIcon
                                status={executionSummary.status}
                                paused={paused}
                            />
                        )}
                        {(hasErrors || hasWarnings) && (
                            <span
                                className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                                    hasErrors
                                        ? "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400"
                                        : "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400"
                                }`}
                            >
                                {diagnostics.length}
                            </span>
                        )}
                    </div>
                </div>
                <div className="px-3 py-2.5">
                    <div className="font-medium text-sm truncate text-foreground">
                        {name}
                    </div>
                    <div className="text-[11px] font-mono text-muted-foreground">
                        {id}
                    </div>
                    <div className="text-[11px] mt-1 text-muted-foreground">
                        {description}
                    </div>
                    {children && (
                        <div className="mt-2 border-t pt-2 border-border">
                            {children}
                        </div>
                    )}
                </div>
            </div>
            {(hasSourceEdge || (isEditing && hasSourceEdge !== false)) && (
                <Handle
                    type="source"
                    position={sourcePosition}
                    className={handleClass}
                />
            )}
        </div>
    );
}

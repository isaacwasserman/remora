import type { Diagnostic } from "@remoraflow/core";
import { Handle, Position } from "@xyflow/react";
import type { ReactNode } from "react";
import { useEditContext } from "../edit-context";
import type { StepExecutionSummary } from "../execution-state";
import type { LayoutDirection } from "../graph-layout";

interface BaseNodeProps {
  id: string;
  name: string;
  typeLabel: string;
  typeLabelColor: string;
  accent: string;
  description: string;
  diagnostics: Diagnostic[];
  icon?: ReactNode;
  children?: ReactNode;
  selected?: boolean;
  hasSourceEdge?: boolean;
  hasTargetEdge?: boolean;
  executionSummary?: StepExecutionSummary;
  paused?: boolean;
  layoutDirection?: LayoutDirection;
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

export function BaseNode({
  id,
  name,
  typeLabel,
  typeLabelColor,
  accent,
  description,
  diagnostics,
  icon,
  children,
  selected,
  hasSourceEdge = true,
  hasTargetEdge = true,
  executionSummary,
  paused,
  layoutDirection = "vertical",
}: BaseNodeProps) {
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
      case "skipped":
        opacityClass = "opacity-50";
        break;
    }
  } else {
    if (hasErrors) ringClass = "ring-2 ring-red-500";
    else if (hasWarnings) ringClass = "ring-2 ring-amber-400";
    else if (selected) ringClass = "ring-2 ring-blue-400";
  }

  const hasRing = hasErrors || hasWarnings || selected || !!executionSummary;

  const handleClass = isEditing
    ? "!w-3 !h-3 !bg-blue-400 hover:!bg-blue-500 !border-2 !border-background"
    : "!w-2 !h-2 !bg-muted-foreground";

  return (
    <div
      className={`rounded-lg shadow-md dark:shadow-foreground/[0.06] border-l-4 w-[300px] transition-shadow duration-150 bg-card ${ringClass} ${opacityClass} ${hasRing ? "" : "hover:ring-2 hover:ring-ring"} ${isEditing ? "cursor-grab active:cursor-grabbing group" : ""} relative`}
      style={{ borderLeftColor: accent }}
    >
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
          &times;
        </button>
      )}
      {(hasTargetEdge || (isEditing && hasTargetEdge !== false)) && (
        <Handle
          type="target"
          position={targetPosition}
          className={handleClass}
        />
      )}
      <div className="px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {icon && (
              <span className={`shrink-0 ${typeLabelColor}`}>{icon}</span>
            )}
            <span
              className={`text-[10px] font-semibold uppercase tracking-wide shrink-0 ${typeLabelColor}`}
            >
              {typeLabel}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {executionSummary && executionSummary.totalRetries > 0 && (
              <span className="text-[10px] px-1 py-0.5 rounded bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-400 font-medium">
                {executionSummary.totalRetries}{" "}
                {executionSummary.totalRetries === 1 ? "retry" : "retries"}
              </span>
            )}
            {executionSummary && (
              <StatusIcon status={executionSummary.status} paused={paused} />
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
        <div className="font-medium text-sm truncate text-foreground">
          {name}
        </div>
        <div className="text-[11px] font-mono text-muted-foreground">{id}</div>
        <div className="text-[11px] mt-1 text-muted-foreground">
          {description}
        </div>
        {children && (
          <div className="mt-2 border-t pt-2 border-border">{children}</div>
        )}
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

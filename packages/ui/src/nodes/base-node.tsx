import type { Diagnostic } from "@remoraflow/core";
import { Handle, Position } from "@xyflow/react";
import type { ReactNode } from "react";
import { useEditContext } from "../edit-context";
import type { StepExecutionSummary } from "../execution-state";

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
}

function StatusIcon({ status, paused }: { status: string; paused?: boolean }) {
  switch (status) {
    case "running":
      if (paused) {
        return (
          <svg
            className="rf:w-3.5 rf:h-3.5 rf:text-amber-500 rf:shrink-0"
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
        <span className="rf:inline-block rf:w-3.5 rf:h-3.5 rf:rounded-full rf:border-2 rf:border-blue-400 rf:border-t-transparent rf:animate-spin rf:shrink-0" />
      );
    case "completed":
      return (
        <svg
          className="rf:w-3.5 rf:h-3.5 rf:text-green-500 rf:shrink-0"
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
          className="rf:w-3.5 rf:h-3.5 rf:text-red-500 rf:shrink-0"
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
}: BaseNodeProps) {
  const { isEditing, onDeleteStep } = useEditContext();
  const hasErrors = diagnostics.some((d) => d.severity === "error");
  const hasWarnings =
    !hasErrors && diagnostics.some((d) => d.severity === "warning");

  let ringClass = "";
  let opacityClass = "";
  if (executionSummary) {
    switch (executionSummary.status) {
      case "running":
        ringClass = paused
          ? "rf:ring-2 rf:ring-amber-400"
          : "rf:ring-2 rf:ring-blue-400 rf:animate-pulse";
        break;
      case "completed":
        ringClass = "rf:ring-2 rf:ring-green-400";
        break;
      case "failed":
        ringClass = "rf:ring-2 rf:ring-red-500";
        break;
      case "skipped":
        opacityClass = "rf:opacity-50";
        break;
    }
  } else {
    if (hasErrors) ringClass = "rf:ring-2 rf:ring-red-500";
    else if (hasWarnings) ringClass = "rf:ring-2 rf:ring-amber-400";
    else if (selected) ringClass = "rf:ring-2 rf:ring-blue-400";
  }

  const hasRing = hasErrors || hasWarnings || selected || !!executionSummary;

  const handleClass = isEditing
    ? "rf:!w-3 rf:!h-3 rf:!bg-blue-400 rf:hover:!bg-blue-500 rf:!border-2 rf:!border-background"
    : "rf:!w-2 rf:!h-2 rf:!bg-muted-foreground";

  return (
    <div
      className={`rf:rounded-lg rf:shadow-md rf:dark:shadow-foreground/[0.06] rf:border-l-4 rf:w-[300px] rf:transition-shadow rf:duration-150 rf:bg-card ${ringClass} ${opacityClass} ${hasRing ? "" : "rf:hover:ring-2 rf:hover:ring-ring"} ${isEditing ? "rf:cursor-grab rf:active:cursor-grabbing rf:group" : ""} rf:relative`}
      style={{ borderLeftColor: accent }}
    >
      {isEditing && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDeleteStep(id);
          }}
          className="rf:absolute rf:-top-2 rf:-right-2 rf:z-10 rf:w-5 rf:h-5 rf:rounded-full rf:bg-muted-foreground/70 rf:text-white rf:text-xs rf:flex rf:items-center rf:justify-center rf:hover:bg-muted-foreground rf:shadow-sm rf:transition-opacity rf:opacity-0 rf:group-hover:opacity-100"
          title="Delete step"
        >
          &times;
        </button>
      )}
      {(hasTargetEdge || (isEditing && hasTargetEdge !== false)) && (
        <Handle type="target" position={Position.Top} className={handleClass} />
      )}
      <div className="rf:px-3 rf:py-2.5">
        <div className="rf:flex rf:items-center rf:justify-between rf:gap-2">
          <div className="rf:flex rf:items-center rf:gap-1.5 rf:min-w-0">
            {icon && (
              <span className={`rf:shrink-0 ${typeLabelColor}`}>{icon}</span>
            )}
            <span
              className={`rf:text-[10px] rf:font-semibold rf:uppercase rf:tracking-wide rf:shrink-0 ${typeLabelColor}`}
            >
              {typeLabel}
            </span>
          </div>
          <div className="rf:flex rf:items-center rf:gap-1.5 rf:shrink-0">
            {executionSummary && executionSummary.totalRetries > 0 && (
              <span className="rf:text-[10px] rf:px-1 rf:py-0.5 rounded rf:bg-amber-100 rf:text-amber-600 rf:dark:bg-amber-900/50 rf:dark:text-amber-400 rf:font-medium">
                {executionSummary.totalRetries}{" "}
                {executionSummary.totalRetries === 1 ? "retry" : "retries"}
              </span>
            )}
            {executionSummary && (
              <StatusIcon status={executionSummary.status} paused={paused} />
            )}
            {(hasErrors || hasWarnings) && (
              <span
                className={`rf:text-xs rf:px-1.5 rf:py-0.5 rf:rounded-full rf:font-medium ${
                  hasErrors
                    ? "rf:bg-red-100 rf:text-red-700 rf:dark:bg-red-900/50 rf:dark:text-red-400"
                    : "rf:bg-amber-100 rf:text-amber-700 rf:dark:bg-amber-900/50 rf:dark:text-amber-400"
                }`}
              >
                {diagnostics.length}
              </span>
            )}
          </div>
        </div>
        <div className="rf:font-medium rf:text-sm rf:truncate rf:text-foreground">
          {name}
        </div>
        <div className="rf:text-[11px] rf:font-mono rf:text-muted-foreground">
          {id}
        </div>
        <div className="rf:text-[11px] rf:mt-1 rf:text-muted-foreground">
          {description}
        </div>
        {children && (
          <div className="rf:mt-2 rf:border-t rf:pt-2 rf:border-border">
            {children}
          </div>
        )}
      </div>
      {(hasSourceEdge || (isEditing && hasSourceEdge !== false)) && (
        <Handle
          type="source"
          position={Position.Bottom}
          className={handleClass}
        />
      )}
    </div>
  );
}

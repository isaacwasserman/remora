import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { Timer } from "lucide-react";
import { useEditContext } from "../edit-context";
import type { StepNodeData } from "../graph-layout";
import { BaseNode } from "./base-node";

function renderExpr(
  expr:
    | { type: "literal"; value: unknown }
    | { type: "jmespath"; expression: string }
    | { type: "template"; template: string },
): string {
  if (expr.type === "literal") return JSON.stringify(expr.value);
  if (expr.type === "template") return expr.template;
  return expr.expression;
}

export function WaitForConditionNode({ data, selected }: NodeProps) {
  const { isEditing, onDeleteStep } = useEditContext();
  const {
    step,
    diagnostics,
    isGroup,
    groupWidth,
    groupHeight,
    hasSourceEdge,
    executionSummary,
    paused,
  } = data as unknown as StepNodeData & {
    isGroup?: boolean;
    groupWidth?: number;
    groupHeight?: number;
  };
  if (step.type !== "wait-for-condition") return null;

  if (isGroup) {
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
    } else if (hasErrors) ringClass = "ring-2 ring-red-500";
    else if (hasWarnings) ringClass = "ring-2 ring-amber-400";
    else if (selected) ringClass = "ring-2 ring-orange-400";

    return (
      <div
        className={`rounded-xl border-2 border-dashed transition-colors duration-150 border-orange-300 bg-orange-50/30 dark:border-orange-700 dark:bg-orange-950/30 ${ringClass} ${isEditing ? "group" : ""} relative`}
        style={{ width: groupWidth, height: groupHeight }}
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
          position={Position.Top}
          className={
            isEditing
              ? "!w-3 !h-3 !bg-blue-400 hover:!bg-blue-500 !border-2 !border-background"
              : "!bg-orange-500 !w-2.5 !h-2.5"
          }
        />
        <div className="px-3 py-2 flex items-center gap-2">
          <Timer className="w-3.5 h-3.5 text-orange-500 shrink-0" />
          <span className="text-[10px] font-semibold uppercase tracking-wide text-orange-500">
            Wait
          </span>
          <span className="text-sm font-medium text-foreground truncate">
            {step.name}
          </span>
        </div>
        {(hasSourceEdge || isEditing) && (
          <Handle
            type="source"
            position={Position.Bottom}
            className={
              isEditing
                ? "!w-3 !h-3 !bg-blue-400 hover:!bg-blue-500 !border-2 !border-background"
                : "!bg-orange-500 !w-2.5 !h-2.5"
            }
          />
        )}
      </div>
    );
  }

  // Non-group fallback
  return (
    <BaseNode
      id={step.id}
      name={step.name}
      typeLabel="Wait For Condition"
      typeLabelColor="text-orange-500"
      accent="#f97316"
      icon={<Timer className="w-3.5 h-3.5" />}
      description={step.description}
      diagnostics={diagnostics}
      selected={selected}
      hasSourceEdge={hasSourceEdge}
      executionSummary={executionSummary}
      paused={paused}
    >
      <div className="flex gap-1.5 text-[11px]">
        <span className="text-muted-foreground shrink-0">until:</span>
        <span className="font-mono text-muted-foreground truncate">
          {renderExpr(step.params.condition)}
        </span>
      </div>
      {step.params.maxAttempts && (
        <div className="mt-0.5 flex gap-1.5 text-[11px]">
          <span className="text-muted-foreground shrink-0">max attempts:</span>
          <span className="font-mono text-muted-foreground">
            {renderExpr(step.params.maxAttempts)}
          </span>
        </div>
      )}
    </BaseNode>
  );
}

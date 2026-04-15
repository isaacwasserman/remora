import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { Repeat } from "lucide-react";
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

export function ForEachNode({ data, selected }: NodeProps) {
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
  if (step.type !== "for-each") return null;

  if (isGroup) {
    const hasErrors = diagnostics.some((d) => d.severity === "error");
    const hasWarnings =
      !hasErrors && diagnostics.some((d) => d.severity === "warning");

    let ringClass = "";
    let borderColor = "rf:border-emerald-300 rf:dark:border-emerald-700";
    if (executionSummary) {
      switch (executionSummary.status) {
        case "running":
          ringClass = paused
            ? "rf:ring-2 rf:ring-amber-400"
            : "rf:ring-2 rf:ring-blue-400 rf:animate-pulse";
          borderColor = paused
            ? "rf:border-amber-300 rf:dark:border-amber-700"
            : "rf:border-blue-300 rf:dark:border-blue-700";
          break;
        case "completed":
          ringClass = "rf:ring-2 rf:ring-green-400";
          borderColor = "rf:border-green-400 rf:dark:border-green-600";
          break;
        case "failed":
          ringClass = "rf:ring-2 rf:ring-red-500";
          borderColor = "rf:border-red-300 rf:dark:border-red-700";
          break;
      }
    } else {
      if (hasErrors) ringClass = "rf:ring-2 rf:ring-red-500";
      else if (hasWarnings) ringClass = "rf:ring-2 rf:ring-amber-400";
      else if (selected) ringClass = "rf:ring-2 rf:ring-emerald-400";
    }

    return (
      <div
        className={`rf:rounded-xl rf:border-2 rf:border-dashed rf:transition-colors rf:duration-150 ${borderColor} rf:bg-emerald-50/30 rf:hover:bg-emerald-50/60 rf:hover:border-emerald-500 rf:dark:bg-emerald-950/30 rf:dark:hover:bg-emerald-950/50 rf:dark:hover:border-emerald-500 ${ringClass} ${isEditing ? "rf:group" : ""} rf:relative`}
        style={{ width: groupWidth, height: groupHeight }}
      >
        {isEditing && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteStep(step.id);
            }}
            className="rf:absolute rf:-top-2 rf:-right-2 rf:z-10 rf:w-5 rf:h-5 rf:rounded-full rf:bg-muted-foreground/70 rf:text-white rf:text-xs rf:flex rf:items-center rf:justify-center rf:hover:bg-muted-foreground rf:shadow-sm rf:transition-opacity rf:opacity-0 rf:group-hover:opacity-100"
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
              ? "rf:!w-3 rf:!h-3 rf:!bg-blue-400 rf:hover:!bg-blue-500 rf:!border-2 rf:!border-background"
              : "rf:!bg-emerald-500 rf:!w-2.5 rf:!h-2.5"
          }
        />
        <div className="rf:px-3 rf:py-2 rf:flex rf:items-center rf:gap-2">
          <Repeat className="rf:w-3.5 rf:h-3.5 rf:text-emerald-500 rf:shrink-0" />
          <span className="rf:text-[10px] rf:font-semibold rf:uppercase rf:tracking-wide rf:text-emerald-500">
            Loop
          </span>
          <span className="rf:text-sm rf:font-medium rf:truncate rf:text-foreground">
            {step.name}
          </span>
        </div>
        {(hasSourceEdge || isEditing) && (
          <Handle
            type="source"
            position={Position.Bottom}
            className={
              isEditing
                ? "rf:!w-3 rf:!h-3 rf:!bg-blue-400 rf:hover:!bg-blue-500 rf:!border-2 rf:!border-background"
                : "rf:!bg-emerald-500 rf:!w-2.5 rf:!h-2.5"
            }
          />
        )}
      </div>
    );
  }

  // Non-group fallback (for-each with no resolvable children)
  const resolved = executionSummary?.latestResolvedInputs as
    | Record<string, unknown>
    | undefined;
  const hasTargetResolved = resolved?.target !== undefined;

  return (
    <BaseNode
      id={step.id}
      name={step.name}
      typeLabel="For Each"
      typeLabelColor="rf:text-emerald-500"
      accent="#10b981"
      icon={<Repeat className="rf:w-3.5 rf:h-3.5" />}
      description={step.description}
      diagnostics={diagnostics}
      selected={selected}
      hasSourceEdge={hasSourceEdge}
      executionSummary={executionSummary}
      paused={paused}
    >
      <div className="rf:flex rf:gap-1.5 rf:text-[11px]">
        <span className="rf:text-muted-foreground rf:shrink-0">target:</span>
        <span
          className={`rf:font-mono rf:truncate ${hasTargetResolved ? "rf:text-emerald-700 rf:dark:text-emerald-400" : "rf:text-muted-foreground"}`}
          title={hasTargetResolved ? renderExpr(step.params.target) : undefined}
        >
          {hasTargetResolved
            ? `[${Array.isArray(resolved.target) ? resolved.target.length : "?"} items]`
            : renderExpr(step.params.target)}
        </span>
      </div>
      <div className="rf:mt-0.5 rf:flex rf:gap-1.5 rf:text-[11px]">
        <span className="rf:text-muted-foreground rf:shrink-0">as:</span>
        <span className="rf:font-mono rf:text-muted-foreground">
          {step.params.itemName}
        </span>
      </div>
    </BaseNode>
  );
}

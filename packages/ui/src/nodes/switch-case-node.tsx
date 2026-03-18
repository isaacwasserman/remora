import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { GitBranch } from "lucide-react";
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

export function SwitchCaseNode({ data, selected }: NodeProps) {
  const { isEditing, onDeleteStep } = useEditContext();
  const {
    step,
    diagnostics,
    isGroup,
    groupWidth,
    groupHeight,
    hasSourceEdge,
    executionSummary,
  } = data as unknown as StepNodeData & {
    isGroup?: boolean;
    groupWidth?: number;
    groupHeight?: number;
  };
  if (step.type !== "switch-case") return null;

  if (isGroup) {
    const hasErrors = diagnostics.some((d) => d.severity === "error");
    const hasWarnings =
      !hasErrors && diagnostics.some((d) => d.severity === "warning");

    let ringClass = "";
    let borderColor = "border-amber-300 dark:border-amber-700";
    if (executionSummary) {
      switch (executionSummary.status) {
        case "running":
          ringClass = "ring-2 ring-blue-400 animate-pulse";
          borderColor = "border-blue-300 dark:border-blue-700";
          break;
        case "completed":
          ringClass = "ring-2 ring-green-400";
          borderColor = "border-green-400 dark:border-green-600";
          break;
        case "failed":
          ringClass = "ring-2 ring-red-500";
          borderColor = "border-red-300 dark:border-red-700";
          break;
      }
    } else {
      if (hasErrors) ringClass = "ring-2 ring-red-500";
      else if (hasWarnings) ringClass = "ring-2 ring-amber-400";
      else if (selected) ringClass = "ring-2 ring-amber-400";
    }

    return (
      <div
        className={`rounded-xl border-2 border-dashed transition-colors duration-150 ${borderColor} bg-amber-50/30 hover:bg-amber-50/60 hover:border-amber-500 dark:bg-amber-950/30 dark:hover:bg-amber-950/50 dark:hover:border-amber-500 ${ringClass} ${isEditing ? "group" : ""} relative`}
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
              : "!bg-amber-500 !w-2.5 !h-2.5"
          }
        />
        <div className="px-3 py-2 flex items-center gap-2">
          <GitBranch className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-500">
            Branch
          </span>
          <span className="text-sm font-medium truncate text-foreground">
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
                : "!bg-amber-500 !w-2.5 !h-2.5"
            }
          />
        )}
      </div>
    );
  }

  // Non-group fallback
  const resolved = executionSummary?.latestResolvedInputs as
    | Record<string, unknown>
    | undefined;
  const hasSwitchResolved = resolved?.switchOn !== undefined;

  return (
    <BaseNode
      id={step.id}
      name={step.name}
      typeLabel="Switch Case"
      typeLabelColor="text-amber-500"
      accent="#f59e0b"
      icon={<GitBranch className="w-3.5 h-3.5" />}
      description={step.description}
      diagnostics={diagnostics}
      selected={selected}
      hasSourceEdge={hasSourceEdge}
      executionSummary={executionSummary}
    >
      <div className="flex gap-1.5 text-[11px]">
        <span className="text-muted-foreground shrink-0">on:</span>
        <span
          className={`font-mono truncate ${hasSwitchResolved ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}`}
          title={
            hasSwitchResolved ? renderExpr(step.params.switchOn) : undefined
          }
        >
          {hasSwitchResolved
            ? JSON.stringify(resolved.switchOn)
            : renderExpr(step.params.switchOn)}
        </span>
      </div>
      <div className="mt-1.5 space-y-0.5">
        {step.params.cases.map((c) => (
          <div
            key={c.branchBodyStepId}
            className="flex items-center gap-1.5 text-[11px]"
          >
            <span className="font-mono text-muted-foreground">
              {c.value.type === "default" ? "default" : renderExpr(c.value)}
            </span>
            <span className="text-muted-foreground/50">&rarr;</span>
            <span className="font-mono text-muted-foreground">
              {c.branchBodyStepId}
            </span>
          </div>
        ))}
      </div>
    </BaseNode>
  );
}

import type { NodeProps } from "@xyflow/react";
import { Moon } from "lucide-react";
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

export function SleepNode({ data, selected }: NodeProps) {
  const { step, diagnostics, hasSourceEdge, executionSummary, paused } =
    data as unknown as StepNodeData;
  if (step.type !== "sleep") return null;

  return (
    <BaseNode
      id={step.id}
      name={step.name}
      typeLabel="Sleep"
      typeLabelColor="text-amber-500"
      accent="#f59e0b"
      icon={<Moon className="w-3.5 h-3.5" />}
      description={step.description}
      diagnostics={diagnostics}
      selected={selected}
      hasSourceEdge={hasSourceEdge}
      executionSummary={executionSummary}
      paused={paused}
    >
      <div className="flex gap-1.5 text-[11px]">
        <span className="text-muted-foreground shrink-0">duration:</span>
        <span className="font-mono text-muted-foreground truncate">
          {renderExpr(step.params.durationMs)}ms
        </span>
      </div>
    </BaseNode>
  );
}

import type { NodeProps } from "@xyflow/react";
import { Wrench } from "lucide-react";
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

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export function ToolCallNode({ data, selected }: NodeProps) {
  const { step, diagnostics, hasSourceEdge, executionSummary, paused } =
    data as unknown as StepNodeData;
  if (step.type !== "tool-call") return null;

  const entries = Object.entries(step.params.toolInput);
  const resolved = executionSummary?.latestResolvedInputs as
    | Record<string, unknown>
    | undefined;

  return (
    <BaseNode
      id={step.id}
      name={step.name}
      typeLabel="Tool Call"
      typeLabelColor="rf:text-blue-500"
      accent="#3b82f6"
      icon={<Wrench className="rf:w-3.5 rf:h-3.5" />}
      description={step.description}
      diagnostics={diagnostics}
      selected={selected}
      hasSourceEdge={hasSourceEdge}
      executionSummary={executionSummary}
      paused={paused}
    >
      <div className="rf:text-xs rf:font-mono rf:font-medium rf:text-foreground">
        {step.params.toolName}
      </div>
      {entries.length > 0 && (
        <div className="rf:mt-1.5 rf:space-y-0.5">
          {entries.map(([key, val]) => {
            const resolvedVal = resolved?.[key];
            const hasResolved = resolvedVal !== undefined;
            return (
              <div key={key} className="rf:flex rf:gap-1.5 rf:text-[11px]">
                <span className="rf:text-muted-foreground rf:shrink-0">
                  {key}:
                </span>
                <span
                  className={`rf:font-mono rf:truncate ${hasResolved ? "rf:text-emerald-700 rf:dark:text-emerald-400" : "rf:text-muted-foreground"}`}
                  title={hasResolved ? renderExpr(val) : undefined}
                >
                  {hasResolved ? formatValue(resolvedVal) : renderExpr(val)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </BaseNode>
  );
}

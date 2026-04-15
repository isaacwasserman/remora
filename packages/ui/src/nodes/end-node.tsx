import type { NodeProps } from "@xyflow/react";
import { Hand } from "lucide-react";
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

export function EndNode({ data, selected }: NodeProps) {
  const {
    step,
    diagnostics,
    executionSummary,
    outputSchema,
    paused,
    layoutDirection,
  } = data as unknown as StepNodeData;
  if (step?.type !== "end") return null;

  const schema = outputSchema as
    | { properties?: Record<string, { type?: string }> }
    | undefined;
  const schemaProperties = schema?.properties
    ? Object.entries(schema.properties)
    : [];

  return (
    <BaseNode
      id={step.id}
      name={step.name}
      typeLabel="End"
      typeLabelColor="text-muted-foreground"
      accent="#6b7280"
      icon={<Hand className="w-3.5 h-3.5" />}
      description={step.description}
      diagnostics={diagnostics}
      selected={selected}
      hasSourceEdge={false}
      executionSummary={executionSummary}
      paused={paused}
      layoutDirection={layoutDirection}
    >
      {step.params?.output && (
        <div className="flex gap-1.5 text-[11px]">
          <span className="text-muted-foreground shrink-0">output:</span>
          <span className="font-mono text-muted-foreground truncate">
            {renderExpr(step.params.output)}
          </span>
        </div>
      )}
      {schemaProperties.length > 0 && (
        <div className="mt-1 space-y-0.5">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">
            Output Schema
          </div>
          {schemaProperties.map(([key, val]) => (
            <div key={key} className="flex gap-1.5 text-[11px]">
              <span className="text-muted-foreground font-medium shrink-0">
                {key}
              </span>
              <span className="font-mono text-muted-foreground">
                {val?.type}
              </span>
            </div>
          ))}
        </div>
      )}
    </BaseNode>
  );
}

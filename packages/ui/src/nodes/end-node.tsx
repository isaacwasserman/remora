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
  const { step, diagnostics, executionSummary, outputSchema, paused } =
    data as unknown as StepNodeData;
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
      typeLabelColor="rf:text-muted-foreground"
      accent="#6b7280"
      icon={<Hand className="rf:w-3.5 rf:h-3.5" />}
      description={step.description}
      diagnostics={diagnostics}
      selected={selected}
      hasSourceEdge={false}
      executionSummary={executionSummary}
      paused={paused}
    >
      {step.params?.output && (
        <div className="rf:flex rf:gap-1.5 rf:text-[11px]">
          <span className="rf:text-muted-foreground rf:shrink-0">output:</span>
          <span className="rf:font-mono rf:text-muted-foreground rf:truncate">
            {renderExpr(step.params.output)}
          </span>
        </div>
      )}
      {schemaProperties.length > 0 && (
        <div className="rf:mt-1 rf:space-y-0.5">
          <div className="rf:text-[10px] rf:text-muted-foreground rf:uppercase rf:tracking-wide rf:font-semibold">
            Output Schema
          </div>
          {schemaProperties.map(([key, val]) => (
            <div key={key} className="rf:flex rf:gap-1.5 rf:text-[11px]">
              <span className="rf:text-muted-foreground rf:font-medium rf:shrink-0">
                {key}
              </span>
              <span className="rf:font-mono rf:text-muted-foreground">
                {val?.type}
              </span>
            </div>
          ))}
        </div>
      )}
    </BaseNode>
  );
}

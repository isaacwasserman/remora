import type { NodeProps } from "@xyflow/react";
import { FileOutput } from "lucide-react";
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

export function ExtractDataNode({ data, selected }: NodeProps) {
  const { step, diagnostics, hasSourceEdge, executionSummary, paused } =
    data as unknown as StepNodeData;
  if (step.type !== "extract-data") return null;

  const outputFormat = step.params.outputFormat as
    | { properties?: Record<string, unknown> }
    | undefined;
  const outputKeys = outputFormat?.properties
    ? Object.keys(outputFormat.properties)
    : [];

  const resolved = executionSummary?.latestResolvedInputs as
    | Record<string, unknown>
    | undefined;
  const hasSourceResolved = resolved?.sourceData !== undefined;

  return (
    <BaseNode
      id={step.id}
      name={step.name}
      typeLabel="Extract Data"
      typeLabelColor="rf:text-purple-500"
      accent="#a855f7"
      icon={<FileOutput className="rf:w-3.5 rf:h-3.5" />}
      description={step.description}
      diagnostics={diagnostics}
      selected={selected}
      hasSourceEdge={hasSourceEdge}
      executionSummary={executionSummary}
      paused={paused}
    >
      <div className="rf:flex rf:gap-1.5 rf:text-[11px]">
        <span className="rf:text-muted-foreground rf:shrink-0">source:</span>
        <span
          className={`rf:font-mono rf:truncate ${hasSourceResolved ? "rf:text-emerald-700 rf:dark:text-emerald-400" : "rf:text-muted-foreground"}`}
          title={
            hasSourceResolved ? renderExpr(step.params.sourceData) : undefined
          }
        >
          {hasSourceResolved
            ? typeof resolved.sourceData === "string"
              ? resolved.sourceData
              : JSON.stringify(resolved.sourceData)
            : renderExpr(step.params.sourceData)}
        </span>
      </div>
      {outputKeys.length > 0 && (
        <div className="rf:mt-1 rf:flex rf:gap-1.5 rf:text-[11px]">
          <span className="rf:text-muted-foreground rf:shrink-0">output:</span>
          <span className="rf:font-mono rf:text-muted-foreground">
            {outputKeys.join(", ")}
          </span>
        </div>
      )}
    </BaseNode>
  );
}

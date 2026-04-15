import type { NodeProps } from "@xyflow/react";
import { Play } from "lucide-react";
import type { StepNodeData } from "../graph-layout";
import { BaseNode } from "./base-node";

export function StartStepNode({ data, selected }: NodeProps) {
  const {
    step,
    diagnostics,
    hasSourceEdge,
    executionSummary,
    inputSchema,
    paused,
  } = data as unknown as StepNodeData;
  if (step.type !== "start") return null;

  const schema = inputSchema as
    | { properties?: Record<string, { type?: string }> }
    | undefined;
  const properties = schema?.properties
    ? Object.entries(schema.properties)
    : [];

  return (
    <BaseNode
      id={step.id}
      name={step.name}
      typeLabel="Start"
      typeLabelColor="rf:text-green-500"
      accent="#22c55e"
      icon={<Play className="rf:w-3.5 rf:h-3.5" />}
      description={step.description}
      diagnostics={diagnostics}
      selected={selected}
      hasSourceEdge={hasSourceEdge}
      hasTargetEdge={false}
      executionSummary={executionSummary}
      paused={paused}
    >
      {properties.length > 0 && (
        <div className="rf:space-y-0.5">
          <div className="rf:text-[10px] rf:text-muted-foreground rf:uppercase rf:tracking-wide rf:font-semibold">
            Inputs
          </div>
          {properties.map(([key, val]) => (
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

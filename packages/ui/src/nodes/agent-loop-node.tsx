import type { NodeProps } from "@xyflow/react";
import { Bot } from "lucide-react";
import type { StepNodeData } from "../graph-layout";
import { BaseNode } from "./base-node";

export function AgentLoopNode({ data, selected }: NodeProps) {
  const { step, diagnostics, hasSourceEdge, executionSummary, paused } =
    data as unknown as StepNodeData;
  if (step.type !== "agent-loop") return null;

  return (
    <BaseNode
      id={step.id}
      name={step.name}
      typeLabel="Agent Loop"
      typeLabelColor="rf:text-teal-500"
      accent="#14b8a6"
      icon={<Bot className="rf:w-3.5 rf:h-3.5" />}
      description={step.description}
      diagnostics={diagnostics}
      selected={selected}
      hasSourceEdge={hasSourceEdge}
      executionSummary={executionSummary}
      paused={paused}
    >
      <div className="rf:text-[11px] rf:text-muted-foreground rf:italic rf:line-clamp-2 rf:bg-muted rounded rf:p-1.5 rf:font-mono">
        {step.params.instructions}
      </div>
      {step.params.tools.length > 0 && (
        <div className="rf:mt-1.5 rf:flex rf:gap-1.5 rf:text-[11px]">
          <span className="rf:text-muted-foreground rf:shrink-0">tools:</span>
          <span className="rf:font-mono rf:text-muted-foreground rf:truncate">
            {step.params.tools.join(", ")}
          </span>
        </div>
      )}
    </BaseNode>
  );
}

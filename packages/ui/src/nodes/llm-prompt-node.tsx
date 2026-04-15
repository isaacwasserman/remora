import type { NodeProps } from "@xyflow/react";
import { Sparkles } from "lucide-react";
import type { StepNodeData } from "../graph-layout";
import { BaseNode } from "./base-node";

export function LlmPromptNode({ data, selected }: NodeProps) {
  const { step, diagnostics, hasSourceEdge, executionSummary, paused } =
    data as unknown as StepNodeData;
  if (step.type !== "llm-prompt") return null;

  const outputFormat = step.params.outputFormat as
    | { properties?: Record<string, unknown> }
    | undefined;
  const outputKeys = outputFormat?.properties
    ? Object.keys(outputFormat.properties)
    : [];

  const resolved = executionSummary?.latestResolvedInputs as
    | Record<string, unknown>
    | undefined;
  const resolvedPrompt = resolved?.prompt as string | undefined;

  return (
    <BaseNode
      id={step.id}
      name={step.name}
      typeLabel="LLM Prompt"
      typeLabelColor="rf:text-violet-500"
      accent="#8b5cf6"
      icon={<Sparkles className="rf:w-3.5 rf:h-3.5" />}
      description={step.description}
      diagnostics={diagnostics}
      selected={selected}
      hasSourceEdge={hasSourceEdge}
      executionSummary={executionSummary}
      paused={paused}
    >
      <div
        className={`rf:text-[11px] rf:italic rf:line-clamp-3 rounded rf:p-1.5 rf:font-mono ${
          resolvedPrompt
            ? "rf:text-emerald-700 rf:bg-emerald-50 rf:dark:text-emerald-400 rf:dark:bg-emerald-950/50"
            : "rf:text-muted-foreground rf:bg-muted"
        }`}
        title={resolvedPrompt ? step.params.prompt : undefined}
      >
        {resolvedPrompt ?? step.params.prompt}
      </div>
      {outputKeys.length > 0 && (
        <div className="rf:mt-1.5 rf:text-[11px] rf:text-muted-foreground">
          <span>output: </span>
          <span className="rf:font-mono rf:text-muted-foreground">
            {outputKeys.join(", ")}
          </span>
        </div>
      )}
    </BaseNode>
  );
}

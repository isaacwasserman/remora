import type { NodeProps } from "@xyflow/react";
import { Sparkles } from "lucide-react";
import type { StepNodeData } from "../graph-layout";
import { BaseNode } from "./base-node";

export function LlmPromptNode({ data, selected }: NodeProps) {
	const { step, diagnostics, hasSourceEdge, executionSummary } =
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
			typeLabelColor="text-violet-500"
			accent="#8b5cf6"
			icon={<Sparkles className="w-3.5 h-3.5" />}
			description={step.description}
			diagnostics={diagnostics}
			selected={selected}
			hasSourceEdge={hasSourceEdge}
			executionSummary={executionSummary}
		>
			<div
				className={`text-[11px] italic line-clamp-3 rounded p-1.5 font-mono ${
					resolvedPrompt
						? "text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/50"
						: "text-muted-foreground bg-muted"
				}`}
				title={resolvedPrompt ? step.params.prompt : undefined}
			>
				{resolvedPrompt ?? step.params.prompt}
			</div>
			{outputKeys.length > 0 && (
				<div className="mt-1.5 text-[11px] text-muted-foreground">
					<span>output: </span>
					<span className="font-mono text-muted-foreground">
						{outputKeys.join(", ")}
					</span>
				</div>
			)}
		</BaseNode>
	);
}

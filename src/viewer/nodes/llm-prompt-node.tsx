import type { NodeProps } from "@xyflow/react";
import type { StepNodeData } from "../graph-layout";
import { BaseNode } from "./base-node";

export function LlmPromptNode({ data, selected }: NodeProps) {
	const { step, diagnostics, hasSourceEdge } = data as unknown as StepNodeData;
	if (step.type !== "llm-prompt") return null;

	const outputFormat = step.params.outputFormat as
		| { properties?: Record<string, unknown> }
		| undefined;
	const outputKeys = outputFormat?.properties
		? Object.keys(outputFormat.properties)
		: [];

	return (
		<BaseNode
			id={step.id}
			name={step.name}
			typeLabel="LLM"
			typeLabelColor="text-violet-500"
			accent="#8b5cf6"
			description={step.description}
			diagnostics={diagnostics}
			selected={selected}
			hasSourceEdge={hasSourceEdge}
		>
			<div className="text-[11px] italic line-clamp-3 rounded p-1.5 font-mono text-gray-500 bg-gray-50 dark:text-gray-400 dark:bg-gray-700">
				{step.params.prompt}
			</div>
			{outputKeys.length > 0 && (
				<div className="mt-1.5 text-[11px] text-gray-400 dark:text-gray-500">
					<span>output: </span>
					<span className="font-mono text-gray-500 dark:text-gray-400">
						{outputKeys.join(", ")}
					</span>
				</div>
			)}
		</BaseNode>
	);
}

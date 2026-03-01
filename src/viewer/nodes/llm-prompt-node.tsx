import type { NodeProps } from "@xyflow/react";
import React from "react";
import type { StepNodeData } from "../graph-layout";
import { BaseNode } from "./base-node";

export function LlmPromptNode({ data, selected }: NodeProps) {
	const { step, diagnostics, hasSourceEdge } = data as StepNodeData;
	if (step.type !== "llm-prompt") return null;

	const outputKeys = step.params.outputFormat?.properties
		? Object.keys(step.params.outputFormat.properties)
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
			<div className="text-[11px] text-gray-500 italic line-clamp-3 bg-gray-50 rounded p-1.5 font-mono">
				{step.params.prompt}
			</div>
			{outputKeys.length > 0 && (
				<div className="mt-1.5 text-[11px] text-gray-400">
					<span className="text-gray-400">output: </span>
					<span className="font-mono text-gray-500">
						{outputKeys.join(", ")}
					</span>
				</div>
			)}
		</BaseNode>
	);
}

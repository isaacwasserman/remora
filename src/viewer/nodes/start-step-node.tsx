import type { NodeProps } from "@xyflow/react";
import type { StepNodeData } from "../graph-layout";
import { BaseNode } from "./base-node";

export function StartStepNode({ data, selected }: NodeProps) {
	const { step, diagnostics, hasSourceEdge } = data as unknown as StepNodeData;
	if (step.type !== "start") return null;

	const schemaStr = JSON.stringify(step.params.inputSchema, null, 2);

	return (
		<BaseNode
			id={step.id}
			name={step.name}
			typeLabel="Start"
			typeLabelColor="text-green-500"
			accent="#22c55e"
			description={step.description}
			diagnostics={diagnostics}
			selected={selected}
			hasSourceEdge={hasSourceEdge}
		>
			<div className="text-xs text-gray-600">
				<span className="text-gray-400">Input Schema:</span>
			</div>
			<pre className="text-[11px] font-mono text-gray-600 truncate max-h-[60px] overflow-hidden">
				{schemaStr === "{}" ? "(no inputs)" : schemaStr}
			</pre>
		</BaseNode>
	);
}

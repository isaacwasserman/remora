import type { NodeProps } from "@xyflow/react";
import type { StepNodeData } from "../graph-layout";
import { BaseNode } from "./base-node";

export function AgentLoopNode({ data, selected }: NodeProps) {
	const { step, diagnostics, hasSourceEdge } = data as unknown as StepNodeData;
	if (step.type !== "agent-loop") return null;

	return (
		<BaseNode
			id={step.id}
			name={step.name}
			typeLabel="Agent"
			typeLabelColor="text-teal-500"
			accent="#14b8a6"
			description={step.description}
			diagnostics={diagnostics}
			selected={selected}
			hasSourceEdge={hasSourceEdge}
		>
			<div className="text-[11px] text-gray-500 italic line-clamp-2 bg-gray-50 rounded p-1.5 font-mono">
				{step.params.instructions}
			</div>
			{step.params.tools.length > 0 && (
				<div className="mt-1.5 flex gap-1.5 text-[11px]">
					<span className="text-gray-400 shrink-0">tools:</span>
					<span className="font-mono text-gray-600 truncate">
						{step.params.tools.join(", ")}
					</span>
				</div>
			)}
		</BaseNode>
	);
}

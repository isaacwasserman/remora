import type { NodeProps } from "@xyflow/react";
import { Bot } from "lucide-react";
import type { StepNodeData } from "../graph-layout";
import { BaseNode } from "./base-node";

export function AgentLoopNode({ data, selected }: NodeProps) {
	const { step, diagnostics, hasSourceEdge, executionSummary } =
		data as unknown as StepNodeData;
	if (step.type !== "agent-loop") return null;

	return (
		<BaseNode
			id={step.id}
			name={step.name}
			typeLabel="Agent Loop"
			typeLabelColor="text-teal-500"
			accent="#14b8a6"
			icon={<Bot className="w-3.5 h-3.5" />}
			description={step.description}
			diagnostics={diagnostics}
			selected={selected}
			hasSourceEdge={hasSourceEdge}
			executionSummary={executionSummary}
		>
			<div className="text-[11px] text-muted-foreground italic line-clamp-2 bg-muted rounded p-1.5 font-mono">
				{step.params.instructions}
			</div>
			{step.params.tools.length > 0 && (
				<div className="mt-1.5 flex gap-1.5 text-[11px]">
					<span className="text-muted-foreground shrink-0">tools:</span>
					<span className="font-mono text-muted-foreground truncate">
						{step.params.tools.join(", ")}
					</span>
				</div>
			)}
		</BaseNode>
	);
}

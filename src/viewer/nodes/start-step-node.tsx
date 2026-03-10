import type { NodeProps } from "@xyflow/react";
import type { StepNodeData } from "../graph-layout";
import { BaseNode } from "./base-node";

export function StartStepNode({ data, selected }: NodeProps) {
	const { step, diagnostics, hasSourceEdge, executionSummary } =
		data as unknown as StepNodeData;
	if (step.type !== "start") return null;

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
			executionSummary={executionSummary}
		/>
	);
}

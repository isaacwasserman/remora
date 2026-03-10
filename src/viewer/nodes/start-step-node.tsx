import type { NodeProps } from "@xyflow/react";
import type { StepNodeData } from "../graph-layout";
import { BaseNode } from "./base-node";

export function StartStepNode({ data, selected }: NodeProps) {
	const { step, diagnostics, hasSourceEdge, inputSchema } =
		data as unknown as StepNodeData;
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
			typeLabelColor="text-green-500"
			accent="#22c55e"
			description={step.description}
			diagnostics={diagnostics}
			selected={selected}
			hasSourceEdge={hasSourceEdge}
			hasTargetEdge={false}
		>
			{properties.length > 0 && (
				<div className="space-y-0.5">
					<div className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">
						Inputs
					</div>
					{properties.map(([key, val]) => (
						<div key={key} className="flex gap-1.5 text-[11px]">
							<span className="text-gray-500 font-medium shrink-0">{key}</span>
							<span className="font-mono text-gray-400">{val?.type}</span>
						</div>
					))}
				</div>
			)}
		</BaseNode>
	);
}

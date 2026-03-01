import type { NodeProps } from "@xyflow/react";
import React from "react";
import type { StepNodeData } from "../graph-layout";
import { BaseNode } from "./base-node";

function renderExpr(
	expr:
		| { type: "literal"; value: unknown }
		| { type: "jmespath"; expression: string },
): string {
	if (expr.type === "literal") return JSON.stringify(expr.value);
	return expr.expression;
}

export function ExtractDataNode({ data, selected }: NodeProps) {
	const { step, diagnostics, hasSourceEdge } = data as StepNodeData;
	if (step.type !== "extract-data") return null;

	const outputKeys = step.params.outputFormat?.properties
		? Object.keys(step.params.outputFormat.properties)
		: [];

	return (
		<BaseNode
			id={step.id}
			name={step.name}
			typeLabel="Extract"
			typeLabelColor="text-purple-500"
			accent="#a855f7"
			description={step.description}
			diagnostics={diagnostics}
			selected={selected}
			hasSourceEdge={hasSourceEdge}
		>
			<div className="flex gap-1.5 text-[11px]">
				<span className="text-gray-400 shrink-0">source:</span>
				<span className="font-mono text-gray-600 truncate">
					{renderExpr(step.params.sourceData)}
				</span>
			</div>
			{outputKeys.length > 0 && (
				<div className="mt-1 flex gap-1.5 text-[11px]">
					<span className="text-gray-400 shrink-0">output:</span>
					<span className="font-mono text-gray-500">
						{outputKeys.join(", ")}
					</span>
				</div>
			)}
		</BaseNode>
	);
}

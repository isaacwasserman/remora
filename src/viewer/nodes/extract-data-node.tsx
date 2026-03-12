import type { NodeProps } from "@xyflow/react";
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
	const { step, diagnostics, hasSourceEdge, executionSummary } =
		data as unknown as StepNodeData;
	if (step.type !== "extract-data") return null;

	const outputFormat = step.params.outputFormat as
		| { properties?: Record<string, unknown> }
		| undefined;
	const outputKeys = outputFormat?.properties
		? Object.keys(outputFormat.properties)
		: [];

	const resolved = executionSummary?.latestResolvedInputs as
		| Record<string, unknown>
		| undefined;
	const hasSourceResolved = resolved?.sourceData !== undefined;

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
			executionSummary={executionSummary}
		>
			<div className="flex gap-1.5 text-[11px]">
				<span className="text-gray-400 shrink-0">source:</span>
				<span
					className={`font-mono truncate ${hasSourceResolved ? "text-emerald-700" : "text-gray-600"}`}
					title={
						hasSourceResolved ? renderExpr(step.params.sourceData) : undefined
					}
				>
					{hasSourceResolved
						? typeof resolved.sourceData === "string"
							? resolved.sourceData
							: JSON.stringify(resolved.sourceData)
						: renderExpr(step.params.sourceData)}
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

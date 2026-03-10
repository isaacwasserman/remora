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

export function SleepNode({ data, selected }: NodeProps) {
	const { step, diagnostics, hasSourceEdge } = data as unknown as StepNodeData;
	if (step.type !== "sleep") return null;

	return (
		<BaseNode
			id={step.id}
			name={step.name}
			typeLabel="Sleep"
			typeLabelColor="text-amber-500"
			accent="#f59e0b"
			description={step.description}
			diagnostics={diagnostics}
			selected={selected}
			hasSourceEdge={hasSourceEdge}
		>
			<div className="flex gap-1.5 text-[11px]">
				<span className="text-gray-400 shrink-0">duration:</span>
				<span className="font-mono text-gray-600 truncate">
					{renderExpr(step.params.durationMs)}ms
				</span>
			</div>
		</BaseNode>
	);
}

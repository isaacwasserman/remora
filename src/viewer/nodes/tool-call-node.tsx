import type { NodeProps } from "@xyflow/react";
import type { StepNodeData } from "../graph-layout";
import { useViewerTheme } from "../theme";
import { BaseNode } from "./base-node";

function renderExpr(
	expr:
		| { type: "literal"; value: unknown }
		| { type: "jmespath"; expression: string },
): string {
	if (expr.type === "literal") return JSON.stringify(expr.value);
	return expr.expression;
}

export function ToolCallNode({ data, selected }: NodeProps) {
	const { dark } = useViewerTheme();
	const { step, diagnostics, hasSourceEdge } = data as unknown as StepNodeData;
	if (step.type !== "tool-call") return null;

	const entries = Object.entries(step.params.toolInput);

	return (
		<BaseNode
			id={step.id}
			name={step.name}
			typeLabel="Tool"
			typeLabelColor="text-blue-500"
			accent="#3b82f6"
			description={step.description}
			diagnostics={diagnostics}
			selected={selected}
			hasSourceEdge={hasSourceEdge}
		>
			<div
				className={`text-xs font-mono font-medium ${dark ? "text-gray-300" : "text-gray-700"}`}
			>
				{step.params.toolName}
			</div>
			{entries.length > 0 && (
				<div className="mt-1.5 space-y-0.5">
					{entries.map(([key, val]) => (
						<div key={key} className="flex gap-1.5 text-[11px]">
							<span className="text-gray-400 shrink-0">{key}:</span>
							<span
								className={`font-mono truncate ${dark ? "text-gray-400" : "text-gray-600"}`}
							>
								{renderExpr(val)}
							</span>
						</div>
					))}
				</div>
			)}
		</BaseNode>
	);
}

import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import type { StepNodeData } from "../graph-layout";
import { BaseNode } from "./base-node";

function renderExpr(
	expr:
		| { type: "literal"; value: unknown }
		| { type: "jmespath"; expression: string }
		| { type: "template"; template: string },
): string {
	if (expr.type === "literal") return JSON.stringify(expr.value);
	if (expr.type === "template") return expr.template;
	return expr.expression;
}

export function WaitForConditionNode({ data, selected }: NodeProps) {
	const { step, diagnostics, isGroup, groupWidth, groupHeight, hasSourceEdge } =
		data as unknown as StepNodeData & {
			isGroup?: boolean;
			groupWidth?: number;
			groupHeight?: number;
		};
	if (step.type !== "wait-for-condition") return null;

	if (isGroup) {
		const hasErrors = diagnostics.some((d) => d.severity === "error");
		const hasWarnings =
			!hasErrors && diagnostics.some((d) => d.severity === "warning");

		let ringClass = "";
		if (hasErrors) ringClass = "ring-2 ring-red-500";
		else if (hasWarnings) ringClass = "ring-2 ring-amber-400";
		else if (selected) ringClass = "ring-2 ring-orange-400";

		return (
			<div
				className={`rounded-xl border-2 border-dashed transition-colors duration-150 border-orange-300 bg-orange-50/30 dark:border-orange-700 dark:bg-orange-950/30 ${ringClass}`}
				style={{ width: groupWidth, height: groupHeight }}
			>
				<Handle
					type="target"
					position={Position.Top}
					className="!bg-orange-500 !w-2.5 !h-2.5"
				/>
				<div className="px-3 py-2 flex items-center gap-2">
					<span className="text-[10px] font-semibold uppercase tracking-wide text-orange-500">
						Wait
					</span>
					<span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
						{step.name}
					</span>
				</div>
				{hasSourceEdge && (
					<Handle
						type="source"
						position={Position.Bottom}
						className="!bg-orange-500 !w-2.5 !h-2.5"
					/>
				)}
			</div>
		);
	}

	// Non-group fallback
	return (
		<BaseNode
			id={step.id}
			name={step.name}
			typeLabel="Wait"
			typeLabelColor="text-orange-500"
			accent="#f97316"
			description={step.description}
			diagnostics={diagnostics}
			selected={selected}
			hasSourceEdge={hasSourceEdge}
		>
			<div className="flex gap-1.5 text-[11px]">
				<span className="text-gray-400 shrink-0">until:</span>
				<span className="font-mono text-gray-600 dark:text-gray-400 truncate">
					{renderExpr(step.params.condition)}
				</span>
			</div>
			{step.params.maxAttempts && (
				<div className="mt-0.5 flex gap-1.5 text-[11px]">
					<span className="text-gray-400 shrink-0">max attempts:</span>
					<span className="font-mono text-gray-600 dark:text-gray-400">
						{renderExpr(step.params.maxAttempts)}
					</span>
				</div>
			)}
		</BaseNode>
	);
}

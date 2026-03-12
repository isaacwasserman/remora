import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
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

export function ForEachNode({ data, selected }: NodeProps) {
	const {
		step,
		diagnostics,
		isGroup,
		groupWidth,
		groupHeight,
		hasSourceEdge,
		executionSummary,
	} = data as unknown as StepNodeData & {
		isGroup?: boolean;
		groupWidth?: number;
		groupHeight?: number;
	};
	if (step.type !== "for-each") return null;

	if (isGroup) {
		const hasErrors = diagnostics.some((d) => d.severity === "error");
		const hasWarnings =
			!hasErrors && diagnostics.some((d) => d.severity === "warning");

		let ringClass = "";
		let borderColor = "border-emerald-300 dark:border-emerald-700";
		if (executionSummary) {
			switch (executionSummary.status) {
				case "running":
					ringClass = "ring-2 ring-blue-400 animate-pulse";
					borderColor = "border-blue-300 dark:border-blue-700";
					break;
				case "completed":
					ringClass = "ring-2 ring-green-400";
					borderColor = "border-green-400 dark:border-green-600";
					break;
				case "failed":
					ringClass = "ring-2 ring-red-500";
					borderColor = "border-red-300 dark:border-red-700";
					break;
			}
		} else {
			if (hasErrors) ringClass = "ring-2 ring-red-500";
			else if (hasWarnings) ringClass = "ring-2 ring-amber-400";
			else if (selected) ringClass = "ring-2 ring-emerald-400";
		}

		return (
			<div
				className={`rounded-xl border-2 border-dashed transition-colors duration-150 ${borderColor} bg-emerald-50/30 hover:bg-emerald-50/60 hover:border-emerald-500 dark:bg-emerald-950/30 dark:hover:bg-emerald-950/50 dark:hover:border-emerald-500 ${ringClass}`}
				style={{ width: groupWidth, height: groupHeight }}
			>
				<Handle
					type="target"
					position={Position.Top}
					className="!bg-emerald-500 !w-2.5 !h-2.5"
				/>
				<div className="px-3 py-2 flex items-center gap-2">
					<span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-500">
						Loop
					</span>
					<span className="text-sm font-medium truncate text-gray-800 dark:text-gray-200">
						{step.name}
					</span>
				</div>
				{hasSourceEdge && (
					<Handle
						type="source"
						position={Position.Bottom}
						className="!bg-emerald-500 !w-2.5 !h-2.5"
					/>
				)}
			</div>
		);
	}

	// Non-group fallback (for-each with no resolvable children)
	const resolved = executionSummary?.latestResolvedInputs as
		| Record<string, unknown>
		| undefined;
	const hasTargetResolved = resolved?.target !== undefined;

	return (
		<BaseNode
			id={step.id}
			name={step.name}
			typeLabel="ForEach"
			typeLabelColor="text-emerald-500"
			accent="#10b981"
			description={step.description}
			diagnostics={diagnostics}
			selected={selected}
			hasSourceEdge={hasSourceEdge}
			executionSummary={executionSummary}
		>
			<div className="flex gap-1.5 text-[11px]">
				<span className="text-gray-400 shrink-0">target:</span>
				<span
					className={`font-mono truncate ${hasTargetResolved ? "text-emerald-700 dark:text-emerald-400" : "text-gray-600 dark:text-gray-400"}`}
					title={hasTargetResolved ? renderExpr(step.params.target) : undefined}
				>
					{hasTargetResolved
						? `[${Array.isArray(resolved.target) ? resolved.target.length : "?"} items]`
						: renderExpr(step.params.target)}
				</span>
			</div>
			<div className="mt-0.5 flex gap-1.5 text-[11px]">
				<span className="text-gray-400 shrink-0">as:</span>
				<span className="font-mono text-gray-600 dark:text-gray-400">
					{step.params.itemName}
				</span>
			</div>
		</BaseNode>
	);
}

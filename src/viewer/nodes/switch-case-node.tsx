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

export function SwitchCaseNode({ data, selected }: NodeProps) {
	const { step, diagnostics, isGroup, groupWidth, groupHeight, hasSourceEdge } =
		data as unknown as StepNodeData & {
			isGroup?: boolean;
			groupWidth?: number;
			groupHeight?: number;
		};
	if (step.type !== "switch-case") return null;

	if (isGroup) {
		const hasErrors = diagnostics.some((d) => d.severity === "error");
		const hasWarnings =
			!hasErrors && diagnostics.some((d) => d.severity === "warning");

		let ringClass = "";
		if (hasErrors) ringClass = "ring-2 ring-red-500";
		else if (hasWarnings) ringClass = "ring-2 ring-amber-400";
		else if (selected) ringClass = "ring-2 ring-amber-400";

		return (
			<div
				className={`rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/30 ${ringClass}`}
				style={{ width: groupWidth, height: groupHeight }}
			>
				<Handle
					type="target"
					position={Position.Top}
					className="!bg-amber-500 !w-2.5 !h-2.5"
				/>
				<div className="px-3 py-2 flex items-center gap-2">
					<span className="text-[10px] font-semibold uppercase tracking-wide text-amber-500">
						Branch
					</span>
					<span className="text-sm font-medium text-gray-800 truncate">
						{step.name}
					</span>
				</div>
				{hasSourceEdge && (
					<Handle
						type="source"
						position={Position.Bottom}
						className="!bg-amber-500 !w-2.5 !h-2.5"
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
			typeLabel="Switch"
			typeLabelColor="text-amber-500"
			accent="#f59e0b"
			description={step.description}
			diagnostics={diagnostics}
			selected={selected}
			hasSourceEdge={hasSourceEdge}
		>
			<div className="flex gap-1.5 text-[11px]">
				<span className="text-gray-400 shrink-0">on:</span>
				<span className="font-mono text-gray-600 truncate">
					{renderExpr(step.params.switchOn)}
				</span>
			</div>
			<div className="mt-1.5 space-y-0.5">
				{step.params.cases.map((c) => (
					<div
						key={c.branchBodyStepId}
						className="flex items-center gap-1.5 text-[11px]"
					>
						<span className="font-mono text-gray-500">
							{c.value.type === "default" ? "default" : renderExpr(c.value)}
						</span>
						<span className="text-gray-300">&rarr;</span>
						<span className="font-mono text-gray-600">
							{c.branchBodyStepId}
						</span>
					</div>
				))}
			</div>
		</BaseNode>
	);
}

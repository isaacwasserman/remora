import { Handle, Position } from "@xyflow/react";
import type { ReactNode } from "react";
import type { Diagnostic } from "../../compiler/types";

interface BaseNodeProps {
	id: string;
	name: string;
	typeLabel: string;
	typeLabelColor: string;
	accent: string;
	description: string;
	diagnostics: Diagnostic[];
	children?: ReactNode;
	selected?: boolean;
	hasSourceEdge?: boolean;
}

export function BaseNode({
	id,
	name,
	typeLabel,
	typeLabelColor,
	accent,
	description,
	diagnostics,
	children,
	selected,
	hasSourceEdge = true,
}: BaseNodeProps) {
	const hasErrors = diagnostics.some((d) => d.severity === "error");
	const hasWarnings =
		!hasErrors && diagnostics.some((d) => d.severity === "warning");

	let ringClass = "";
	if (hasErrors) ringClass = "ring-2 ring-red-500";
	else if (hasWarnings) ringClass = "ring-2 ring-amber-400";
	else if (selected) ringClass = "ring-2 ring-blue-400";

	return (
		<div
			className={`bg-white rounded-lg shadow-md border-l-4 w-[300px] ${ringClass}`}
			style={{ borderLeftColor: accent }}
		>
			<Handle
				type="target"
				position={Position.Top}
				className="!bg-gray-400 !w-2 !h-2"
			/>
			<div className="px-3 py-2.5">
				<div className="flex items-center justify-between gap-2">
					<div className="flex items-center gap-2 min-w-0">
						<span
							className={`text-[10px] font-semibold uppercase tracking-wide shrink-0 ${typeLabelColor}`}
						>
							{typeLabel}
						</span>
						<div className="font-medium text-sm text-gray-900 truncate">
							{name}
						</div>
					</div>
					{(hasErrors || hasWarnings) && (
						<span
							className={`text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
								hasErrors
									? "bg-red-100 text-red-700"
									: "bg-amber-100 text-amber-700"
							}`}
						>
							{diagnostics.length}
						</span>
					)}
				</div>
				<div className="text-[11px] text-gray-400 font-mono">{id}</div>
				<div className="text-[11px] text-gray-500 mt-1">{description}</div>
				{children && (
					<div className="mt-2 border-t border-gray-100 pt-2">{children}</div>
				)}
			</div>
			{hasSourceEdge && (
				<Handle
					type="source"
					position={Position.Bottom}
					className="!bg-gray-400 !w-2 !h-2"
				/>
			)}
		</div>
	);
}

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
	hasTargetEdge?: boolean;
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
	hasTargetEdge = true,
}: BaseNodeProps) {
	const hasErrors = diagnostics.some((d) => d.severity === "error");
	const hasWarnings =
		!hasErrors && diagnostics.some((d) => d.severity === "warning");

	let ringClass = "";
	if (hasErrors) ringClass = "ring-2 ring-red-500";
	else if (hasWarnings) ringClass = "ring-2 ring-amber-400";
	else if (selected) ringClass = "ring-2 ring-blue-400";

	const hasRing = hasErrors || hasWarnings || selected;

	return (
		<div
			className={`rounded-lg shadow-md border-l-4 w-[300px] transition-shadow duration-150 bg-white dark:bg-gray-800 ${hasRing ? ringClass : "hover:ring-2 hover:ring-gray-300 dark:hover:ring-gray-600"}`}
			style={{ borderLeftColor: accent }}
		>
			{hasTargetEdge && (
				<Handle
					type="target"
					position={Position.Top}
					className="!w-2 !h-2 !bg-gray-400 dark:!bg-gray-500"
				/>
			)}
			<div className="px-3 py-2.5">
				<div className="flex items-center justify-between gap-2">
					<div className="flex items-center gap-2 min-w-0">
						<span
							className={`text-[10px] font-semibold uppercase tracking-wide shrink-0 ${typeLabelColor}`}
						>
							{typeLabel}
						</span>
						<div className="font-medium text-sm truncate text-gray-900 dark:text-gray-100">
							{name}
						</div>
					</div>
					{(hasErrors || hasWarnings) && (
						<span
							className={`text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
								hasErrors
									? "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400"
									: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400"
							}`}
						>
							{diagnostics.length}
						</span>
					)}
				</div>
				<div className="text-[11px] font-mono text-gray-400 dark:text-gray-500">
					{id}
				</div>
				<div className="text-[11px] mt-1 text-gray-500 dark:text-gray-400">
					{description}
				</div>
				{children && (
					<div className="mt-2 border-t pt-2 border-gray-100 dark:border-gray-700">
						{children}
					</div>
				)}
			</div>
			{hasSourceEdge && (
				<Handle
					type="source"
					position={Position.Bottom}
					className="!w-2 !h-2 !bg-gray-400 dark:!bg-gray-500"
				/>
			)}
		</div>
	);
}

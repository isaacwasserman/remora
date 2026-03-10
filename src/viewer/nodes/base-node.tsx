import { Handle, Position } from "@xyflow/react";
import type { ReactNode } from "react";
import type { Diagnostic } from "../../compiler/types";
import { useViewerTheme } from "../theme";

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
	const { dark } = useViewerTheme();
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
			className={`rounded-lg shadow-md border-l-4 w-[300px] transition-shadow duration-150 ${
				dark ? "bg-gray-800" : "bg-white"
			} ${hasRing ? ringClass : dark ? "hover:ring-2 hover:ring-gray-600" : "hover:ring-2 hover:ring-gray-300"}`}
			style={{ borderLeftColor: accent }}
		>
			<Handle
				type="target"
				position={Position.Top}
				className={`!w-2 !h-2 ${dark ? "!bg-gray-500" : "!bg-gray-400"}`}
			/>
			<div className="px-3 py-2.5">
				<div className="flex items-center justify-between gap-2">
					<div className="flex items-center gap-2 min-w-0">
						<span
							className={`text-[10px] font-semibold uppercase tracking-wide shrink-0 ${typeLabelColor}`}
						>
							{typeLabel}
						</span>
						<div
							className={`font-medium text-sm truncate ${dark ? "text-gray-100" : "text-gray-900"}`}
						>
							{name}
						</div>
					</div>
					{(hasErrors || hasWarnings) && (
						<span
							className={`text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
								hasErrors
									? dark
										? "bg-red-900/50 text-red-400"
										: "bg-red-100 text-red-700"
									: dark
										? "bg-amber-900/50 text-amber-400"
										: "bg-amber-100 text-amber-700"
							}`}
						>
							{diagnostics.length}
						</span>
					)}
				</div>
				<div
					className={`text-[11px] font-mono ${dark ? "text-gray-500" : "text-gray-400"}`}
				>
					{id}
				</div>
				<div
					className={`text-[11px] mt-1 ${dark ? "text-gray-400" : "text-gray-500"}`}
				>
					{description}
				</div>
				{children && (
					<div
						className={`mt-2 border-t pt-2 ${dark ? "border-gray-700" : "border-gray-100"}`}
					>
						{children}
					</div>
				)}
			</div>
			{hasSourceEdge && (
				<Handle
					type="source"
					position={Position.Bottom}
					className={`!w-2 !h-2 ${dark ? "!bg-gray-500" : "!bg-gray-400"}`}
				/>
			)}
		</div>
	);
}

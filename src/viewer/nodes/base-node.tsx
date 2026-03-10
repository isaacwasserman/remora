import { Handle, Position } from "@xyflow/react";
import type { ReactNode } from "react";
import type { Diagnostic } from "../../compiler/types";
import type { StepExecutionSummary } from "../execution-state";

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
	executionSummary?: StepExecutionSummary;
}

function StatusIcon({ status }: { status: string }) {
	switch (status) {
		case "running":
			return (
				<span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin shrink-0" />
			);
		case "completed":
			return (
				<svg
					className="w-3.5 h-3.5 text-green-500 shrink-0"
					viewBox="0 0 16 16"
					fill="currentColor"
					aria-hidden="true"
					role="img"
				>
					<title>Completed</title>
					<path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
				</svg>
			);
		case "failed":
			return (
				<svg
					className="w-3.5 h-3.5 text-red-500 shrink-0"
					viewBox="0 0 16 16"
					fill="currentColor"
					aria-hidden="true"
					role="img"
				>
					<title>Failed</title>
					<path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
				</svg>
			);
		default:
			return null;
	}
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
	executionSummary,
}: BaseNodeProps) {
	const hasErrors = diagnostics.some((d) => d.severity === "error");
	const hasWarnings =
		!hasErrors && diagnostics.some((d) => d.severity === "warning");

	let ringClass = "";
	let opacityClass = "";
	if (executionSummary) {
		switch (executionSummary.status) {
			case "running":
				ringClass = "ring-2 ring-blue-400 animate-pulse";
				break;
			case "completed":
				ringClass = "ring-2 ring-green-400";
				break;
			case "failed":
				ringClass = "ring-2 ring-red-500";
				break;
			case "skipped":
				opacityClass = "opacity-50";
				break;
		}
	} else {
		if (hasErrors) ringClass = "ring-2 ring-red-500";
		else if (hasWarnings) ringClass = "ring-2 ring-amber-400";
		else if (selected) ringClass = "ring-2 ring-blue-400";
	}

	return (
		<div
			className={`bg-white rounded-lg shadow-md border-l-4 w-[300px] ${ringClass} ${opacityClass}`}
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
					<div className="flex items-center gap-1.5 shrink-0">
						{executionSummary && executionSummary.totalRetries > 0 && (
							<span className="text-[10px] px-1 py-0.5 rounded bg-amber-100 text-amber-600 font-medium">
								{executionSummary.totalRetries}{" "}
								{executionSummary.totalRetries === 1 ? "retry" : "retries"}
							</span>
						)}
						{executionSummary && (
							<StatusIcon status={executionSummary.status} />
						)}
						{(hasErrors || hasWarnings) && (
							<span
								className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
									hasErrors
										? "bg-red-100 text-red-700"
										: "bg-amber-100 text-amber-700"
								}`}
							>
								{diagnostics.length}
							</span>
						)}
					</div>
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

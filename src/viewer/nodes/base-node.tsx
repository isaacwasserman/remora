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
	hasTargetEdge?: boolean;
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
	hasTargetEdge = true,
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

	const hasRing = hasErrors || hasWarnings || selected || !!executionSummary;

	return (
		<div
			className={`rounded-lg shadow-md border-l-4 w-[300px] transition-shadow duration-150 bg-card ${ringClass} ${opacityClass} ${hasRing ? "" : "hover:ring-2 hover:ring-ring"}`}
			style={{ borderLeftColor: accent }}
		>
			{hasTargetEdge && (
				<Handle
					type="target"
					position={Position.Top}
					className="!w-2 !h-2 !bg-muted-foreground"
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
						<div className="font-medium text-sm truncate text-foreground">
							{name}
						</div>
					</div>
					<div className="flex items-center gap-1.5 shrink-0">
						{executionSummary && executionSummary.totalRetries > 0 && (
							<span className="text-[10px] px-1 py-0.5 rounded bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-400 font-medium">
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
										? "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400"
										: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400"
								}`}
							>
								{diagnostics.length}
							</span>
						)}
					</div>
				</div>
				<div className="text-[11px] font-mono text-muted-foreground">{id}</div>
				<div className="text-[11px] mt-1 text-muted-foreground">
					{description}
				</div>
				{children && (
					<div className="mt-2 border-t pt-2 border-border">{children}</div>
				)}
			</div>
			{hasSourceEdge && (
				<Handle
					type="source"
					position={Position.Bottom}
					className="!w-2 !h-2 !bg-muted-foreground"
				/>
			)}
		</div>
	);
}

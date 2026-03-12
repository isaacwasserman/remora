import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";

interface GroupHeaderData {
	variant: "switch" | "loop";
	description: string;
	// switch
	expression?: string;
	resolvedExpression?: unknown;
	// loop
	target?: string;
	resolvedTarget?: unknown;
	itemName?: string;
}

const styles = {
	switch: {
		bg: "bg-amber-50",
		border: "border-amber-300",
		label: "text-amber-600",
		mono: "text-amber-800",
		resolved: "text-emerald-700",
		desc: "text-amber-700/70",
		handle: "!bg-amber-500",
		ring: "ring-amber-400",
	},
	loop: {
		bg: "bg-emerald-50",
		border: "border-emerald-300",
		label: "text-emerald-600",
		mono: "text-emerald-800",
		resolved: "text-emerald-700",
		desc: "text-emerald-700/70",
		handle: "!bg-emerald-500",
		ring: "ring-emerald-400",
	},
};

function formatValue(value: unknown): string {
	if (typeof value === "string") return value;
	return JSON.stringify(value);
}

export function GroupHeaderNode({ data, selected }: NodeProps) {
	const {
		variant,
		description,
		expression,
		resolvedExpression,
		target,
		resolvedTarget,
		itemName,
	} = data as unknown as GroupHeaderData;
	const s = styles[variant];

	return (
		<div
			className={`${s.bg} border-2 ${s.border} rounded-lg w-[280px] shadow-sm ${
				selected ? `ring-2 ${s.ring}` : ""
			}`}
		>
			<div className="px-3 py-2">
				{variant === "switch" && (
					<div className="flex items-baseline gap-1.5">
						<span
							className={`text-[10px] font-bold uppercase tracking-wide ${s.label} shrink-0`}
						>
							switch
						</span>
						<span className={`text-[11px] ${s.label}`}>on</span>
						<span
							className={`text-xs font-mono font-medium truncate ${
								resolvedExpression !== undefined ? s.resolved : s.mono
							}`}
							title={resolvedExpression !== undefined ? expression : undefined}
						>
							{resolvedExpression !== undefined
								? formatValue(resolvedExpression)
								: expression}
						</span>
					</div>
				)}
				{variant === "loop" && (
					<div className="flex items-baseline gap-1.5 flex-wrap">
						<span
							className={`text-[10px] font-bold uppercase tracking-wide ${s.label} shrink-0`}
						>
							foreach
						</span>
						<span className={`text-xs font-mono font-medium ${s.mono}`}>
							{itemName}
						</span>
						<span className={`text-[11px] ${s.label}`}>in</span>
						<span
							className={`text-xs font-mono font-medium truncate ${
								resolvedTarget !== undefined ? s.resolved : s.mono
							}`}
							title={resolvedTarget !== undefined ? target : undefined}
						>
							{resolvedTarget !== undefined
								? `[${Array.isArray(resolvedTarget) ? resolvedTarget.length : "?"} items]`
								: target}
						</span>
					</div>
				)}
				{description && (
					<div className={`text-[11px] ${s.desc} mt-0.5 line-clamp-1`}>
						{description}
					</div>
				)}
			</div>
			<Handle
				type="source"
				position={Position.Bottom}
				className={`${s.handle} !w-2 !h-2`}
			/>
		</div>
	);
}

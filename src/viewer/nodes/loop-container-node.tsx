import type { NodeProps } from "@xyflow/react";
import React from "react";

const variants = {
	loop: {
		border: "border-emerald-300",
		bg: "bg-emerald-50/30",
		text: "text-emerald-400",
	},
	branch: {
		border: "border-amber-300",
		bg: "bg-amber-50/30",
		text: "text-amber-400",
	},
};

export function LoopContainerNode({ data }: NodeProps) {
	const { width, height, label, variant = "loop" } = data as {
		width: number;
		height: number;
		label: string;
		variant?: "loop" | "branch";
	};

	const v = variants[variant] ?? variants.loop;

	return (
		<div
			className={`rounded-xl border-2 border-dashed ${v.border} ${v.bg}`}
			style={{ width, height }}
		>
			<div
				className={`absolute top-2 right-3 text-[10px] font-semibold uppercase tracking-wider ${v.text}`}
			>
				{label}
			</div>
		</div>
	);
}

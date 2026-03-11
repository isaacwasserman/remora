import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";

interface GroupHeaderData {
	variant: "switch" | "loop" | "condition";
	description: string;
	// switch
	expression?: string;
	// loop
	target?: string;
	itemName?: string;
	// condition
	condition?: string;
}

const variantStyles = {
	switch: {
		container:
			"bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-700 hover:border-amber-500",
		label: "text-amber-600 dark:text-amber-400",
		mono: "text-amber-800 dark:text-amber-300",
		desc: "text-amber-700/70 dark:text-amber-400/60",
		handle: "!bg-amber-500",
		ring: "ring-amber-400",
	},
	loop: {
		container:
			"bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-700 hover:border-emerald-500",
		label: "text-emerald-600 dark:text-emerald-400",
		mono: "text-emerald-800 dark:text-emerald-300",
		desc: "text-emerald-700/70 dark:text-emerald-400/60",
		handle: "!bg-emerald-500",
		ring: "ring-emerald-400",
	},
	condition: {
		container:
			"bg-orange-50 dark:bg-orange-950/50 border-orange-300 dark:border-orange-700 hover:border-orange-500",
		label: "text-orange-600 dark:text-orange-400",
		mono: "text-orange-800 dark:text-orange-300",
		desc: "text-orange-700/70 dark:text-orange-400/60",
		handle: "!bg-orange-500",
		ring: "ring-orange-400",
	},
};

export function GroupHeaderNode({ data, selected }: NodeProps) {
	const { variant, description, expression, target, itemName, condition } =
		data as unknown as GroupHeaderData;
	const s = variantStyles[variant];

	return (
		<div
			className={`border-2 rounded-lg w-[280px] shadow-sm transition-colors duration-150 ${s.container} ${
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
							className={`text-xs font-mono font-medium ${s.mono} truncate`}
						>
							{expression}
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
							className={`text-xs font-mono font-medium ${s.mono} truncate`}
						>
							{target}
						</span>
					</div>
				)}
				{variant === "condition" && (
					<div className="flex items-baseline gap-1.5">
						<span
							className={`text-[10px] font-bold uppercase tracking-wide ${s.label} shrink-0`}
						>
							wait until
						</span>
						<span
							className={`text-xs font-mono font-medium ${s.mono} truncate`}
						>
							{condition}
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

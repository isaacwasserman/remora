import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import React from "react";

interface SwitchHeaderData {
	name: string;
	description: string;
	expression: string;
}

export function SwitchHeaderNode({ data, selected }: NodeProps) {
	const { description, expression } = data as SwitchHeaderData;

	return (
		<div
			className={`bg-amber-50 border-2 border-amber-300 rounded-lg w-[280px] shadow-sm ${
				selected ? "ring-2 ring-amber-400" : ""
			}`}
		>
			<Handle
				type="target"
				position={Position.Top}
				className="!bg-amber-500 !w-2 !h-2"
			/>
			<div className="px-3 py-2">
				<div className="flex items-baseline gap-1.5">
					<span className="text-[10px] font-bold uppercase tracking-wide text-amber-600 shrink-0">
						switch
					</span>
					<span className="text-[11px] text-amber-600">on</span>
					<span className="text-xs font-mono font-medium text-amber-800 truncate">
						{expression}
					</span>
				</div>
				{description && (
					<div className="text-[11px] text-amber-700/70 mt-0.5 line-clamp-1">
						{description}
					</div>
				)}
			</div>
			<Handle
				type="source"
				position={Position.Bottom}
				className="!bg-amber-500 !w-2 !h-2"
			/>
		</div>
	);
}

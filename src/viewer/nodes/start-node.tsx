import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";

export function StartNode({ selected }: NodeProps) {
	return (
		<div
			className={`bg-gray-100 rounded-full w-[60px] h-[60px] flex items-center justify-center shadow-sm border border-gray-300 ${
				selected ? "ring-2 ring-blue-400" : ""
			}`}
		>
			<span className="text-xs font-medium text-gray-500">Start</span>
			<Handle
				type="source"
				position={Position.Bottom}
				className="!bg-gray-400 !w-2 !h-2"
			/>
		</div>
	);
}

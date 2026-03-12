import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";

export function StartNode({ selected }: NodeProps) {
	return (
		<div
			className={`rounded-full w-[60px] h-[60px] flex items-center justify-center shadow-sm border transition-all duration-150 bg-gray-100 border-gray-300 hover:bg-gray-200 dark:bg-gray-700 dark:border-gray-600 dark:hover:bg-gray-600 ${selected ? "ring-2 ring-blue-400" : "hover:ring-2 hover:ring-gray-300 dark:hover:ring-gray-600"}`}
		>
			<span className="text-xs font-medium text-gray-500 dark:text-gray-400">
				Start
			</span>
			<Handle
				type="source"
				position={Position.Bottom}
				className="!w-2 !h-2 !bg-gray-400 dark:!bg-gray-500"
			/>
		</div>
	);
}

import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { useViewerTheme } from "../theme";

export function StartNode({ selected }: NodeProps) {
	const { dark } = useViewerTheme();
	return (
		<div
			className={`rounded-full w-[60px] h-[60px] flex items-center justify-center shadow-sm border transition-all duration-150 ${
				dark
					? "bg-gray-700 border-gray-600 hover:bg-gray-600"
					: "bg-gray-100 border-gray-300 hover:bg-gray-200"
			} ${selected ? "ring-2 ring-blue-400" : dark ? "hover:ring-2 hover:ring-gray-600" : "hover:ring-2 hover:ring-gray-300"}`}
		>
			<span
				className={`text-xs font-medium ${dark ? "text-gray-400" : "text-gray-500"}`}
			>
				Start
			</span>
			<Handle
				type="source"
				position={Position.Bottom}
				className={`!w-2 !h-2 ${dark ? "!bg-gray-500" : "!bg-gray-400"}`}
			/>
		</div>
	);
}

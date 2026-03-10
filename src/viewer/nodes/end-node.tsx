import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import type { StepNodeData } from "../graph-layout";
import { useViewerTheme } from "../theme";

export function EndNode({ data, selected }: NodeProps) {
	const { dark } = useViewerTheme();
	const { diagnostics } = data as unknown as StepNodeData;
	const hasErrors = diagnostics.some((d) => d.severity === "error");

	let ringClass = "";
	if (hasErrors) ringClass = "ring-2 ring-red-500";
	else if (selected) ringClass = "ring-2 ring-blue-400";

	const hasRing = hasErrors || selected;

	return (
		<div
			className={`rounded-full w-[60px] h-[60px] flex items-center justify-center shadow-sm border transition-all duration-150 ${
				dark
					? "bg-gray-700 border-gray-600 hover:bg-gray-600"
					: "bg-gray-100 border-gray-300 hover:bg-gray-200"
			} ${hasRing ? ringClass : dark ? "hover:ring-2 hover:ring-gray-600" : "hover:ring-2 hover:ring-gray-300"}`}
		>
			<Handle
				type="target"
				position={Position.Top}
				className={`!w-2 !h-2 ${dark ? "!bg-gray-500" : "!bg-gray-400"}`}
			/>
			<span
				className={`text-xs font-medium ${dark ? "text-gray-400" : "text-gray-500"}`}
			>
				End
			</span>
		</div>
	);
}

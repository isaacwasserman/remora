import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import React from "react";
import type { StepNodeData } from "../graph-layout";

export function EndNode({ data, selected }: NodeProps) {
	const { diagnostics } = data as StepNodeData;
	const hasErrors = diagnostics.some((d) => d.severity === "error");

	let ringClass = "";
	if (hasErrors) ringClass = "ring-2 ring-red-500";
	else if (selected) ringClass = "ring-2 ring-blue-400";

	return (
		<div
			className={`bg-gray-100 rounded-full w-[60px] h-[60px] flex items-center justify-center shadow-sm border border-gray-300 ${ringClass}`}
		>
			<Handle type="target" position={Position.Top} className="!bg-gray-400 !w-2 !h-2" />
			<span className="text-xs font-medium text-gray-500">End</span>
		</div>
	);
}

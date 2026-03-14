import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";

export function StartNode({ selected }: NodeProps) {
	return (
		<div
			className={`rounded-full w-[60px] h-[60px] flex items-center justify-center shadow-sm border transition-all duration-150 bg-muted border-border hover:bg-accent ${selected ? "ring-2 ring-blue-400" : "hover:ring-2 hover:ring-ring"}`}
		>
			<span className="text-xs font-medium text-muted-foreground">Start</span>
			<Handle
				type="source"
				position={Position.Bottom}
				className="!w-2 !h-2 !bg-muted-foreground"
			/>
		</div>
	);
}

import {
	BaseEdge,
	EdgeLabelRenderer,
	type EdgeProps,
	getBezierPath,
} from "@xyflow/react";
import React from "react";

export function WorkflowEdge({
	id,
	sourceX,
	sourceY,
	targetX,
	targetY,
	sourcePosition,
	targetPosition,
	label,
	data,
	markerEnd,
	style,
}: EdgeProps) {
	const edgeKind = (data?.edgeKind as string) ?? "sequential";
	const isContinuation = edgeKind === "continuation";

	const [edgePath, labelX, labelY] = getBezierPath({
		sourceX,
		sourceY,
		sourcePosition,
		targetX,
		targetY,
		targetPosition,
	});

	return (
		<>
			<BaseEdge
				id={id}
				path={edgePath}
				markerEnd={markerEnd}
				style={{
					...style,
					strokeDasharray: isContinuation ? "6 3" : undefined,
					stroke: isContinuation ? "#9ca3af" : "#6b7280",
					strokeWidth: 1.5,
				}}
			/>
			{label && (
				<EdgeLabelRenderer>
					<div
						style={{
							position: "absolute",
							transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
							pointerEvents: "all",
							zIndex: 10,
						}}
						className="bg-white px-1.5 py-0.5 rounded text-[10px] text-gray-700 font-medium border border-gray-200 shadow whitespace-nowrap"
					>
						{label}
					</div>
				</EdgeLabelRenderer>
			)}
		</>
	);
}

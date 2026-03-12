import {
	BaseEdge,
	EdgeLabelRenderer,
	type EdgeProps,
	getBezierPath,
} from "@xyflow/react";
import { useDarkMode } from "../theme";

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
	const dark = useDarkMode();
	const edgeKind = (data?.edgeKind as string) ?? "sequential";
	const isContinuation = edgeKind === "continuation";
	const isExecuted = data?.executed === true;
	const hasExecutionState = data?.hasExecutionState === true;

	const [edgePath, labelX, labelY] = getBezierPath({
		sourceX,
		sourceY,
		sourcePosition,
		targetX,
		targetY,
		targetPosition,
	});

	let stroke = dark
		? isContinuation
			? "#6b7280"
			: "#9ca3af"
		: isContinuation
			? "#9ca3af"
			: "#6b7280";
	let strokeWidth = 1.5;
	let opacity = 1;

	if (hasExecutionState) {
		if (isExecuted) {
			stroke = "#22c55e";
			strokeWidth = 2.5;
		} else {
			opacity = 0.3;
		}
	}

	return (
		<>
			<BaseEdge
				id={id}
				path={edgePath}
				markerEnd={markerEnd}
				style={{
					...style,
					strokeDasharray: isContinuation ? "6 3" : undefined,
					stroke,
					strokeWidth,
					opacity,
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
						className="px-1.5 py-0.5 rounded text-[10px] font-medium border-2 shadow whitespace-nowrap transition-colors duration-150 bg-white text-gray-700 border-gray-200 hover:border-gray-500 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:border-gray-400"
					>
						{label}
					</div>
				</EdgeLabelRenderer>
			)}
		</>
	);
}

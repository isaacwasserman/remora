import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  getBezierPath,
} from "@xyflow/react";
import { useEditContext } from "../edit-context";

export function WorkflowEdge({
  id,
  source,
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
  const { isEditing, onDisconnectStep } = useEditContext();
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

  // Default stroke uses the React Flow --xy-edge-stroke variable (mapped to
  // the host theme in styles.css). Override only for execution state coloring.
  let stroke: string | undefined;
  let strokeWidth = 1.5;
  let opacity = isContinuation ? 0.5 : 1;

  if (hasExecutionState) {
    if (isExecuted) {
      stroke = "#22c55e";
      strokeWidth = 2.5;
      opacity = 1;
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
          ...(stroke ? { stroke } : {}),
          strokeWidth,
          opacity,
        }}
      />
      <EdgeLabelRenderer>
        {label && (
          <div
            style={{
              position: "absolute",
              transform: `rf:translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
              zIndex: 10,
            }}
            className="rf:px-1.5 rf:py-0.5 rounded rf:text-[10px] rf:font-medium rf:border-2 shadow rf:whitespace-nowrap rf:transition-colors rf:duration-150 rf:bg-card rf:text-foreground rf:border-border rf:hover:border-foreground"
          >
            {label}
          </div>
        )}
        {isEditing && source && (
          <button
            type="button"
            onClick={() => onDisconnectStep(source)}
            style={{
              position: "absolute",
              transform: `rf:translate(-50%, -50%) translate(${labelX}px,${labelY + (label ? 16 : 0)}px)`,
              pointerEvents: "all",
              zIndex: 10,
            }}
            className="rf:w-4 rf:h-4 rf:rounded-full rf:bg-red-500 rf:text-white rf:text-[10px] rf:flex rf:items-center rf:justify-center rf:hover:bg-red-600 rf:shadow-sm rf:opacity-0 rf:hover:opacity-100 rf:transition-opacity"
            title="Remove connection"
          >
            &times;
          </button>
        )}
      </EdgeLabelRenderer>
    </>
  );
}

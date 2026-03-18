import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  getBezierPath,
} from "@xyflow/react";
import { useEditContext } from "../edit-context";
import { useThemeColors } from "../theme";

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
  const theme = useThemeColors();
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

  let stroke = theme.mutedForeground;
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
          stroke,
          strokeWidth,
          opacity,
        }}
      />
      <EdgeLabelRenderer>
        {label && (
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
              zIndex: 10,
            }}
            className="px-1.5 py-0.5 rounded text-[10px] font-medium border-2 shadow whitespace-nowrap transition-colors duration-150 bg-card text-foreground border-border hover:border-foreground"
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
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY + (label ? 16 : 0)}px)`,
              pointerEvents: "all",
              zIndex: 10,
            }}
            className="w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center hover:bg-red-600 shadow-sm opacity-0 hover:opacity-100 transition-opacity"
            title="Remove connection"
          >
            &times;
          </button>
        )}
      </EdgeLabelRenderer>
    </>
  );
}

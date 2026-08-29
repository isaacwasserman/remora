import {
    BaseEdge,
    EdgeLabelRenderer,
    type EdgeProps,
    getBezierPath,
} from "@xyflow/react";
import { X } from "lucide-react";
import { useEditContext } from "../edit-context";

export function WorkflowEdge({
    id,
    source,
    target,
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
    const branchIndex = data?.branchIndex as number | undefined;
    const isExecuted = data?.executed === true;
    const hasExecutionState = data?.hasExecutionState === true;
    const isPathHighlighted = data?.pathHighlighted === true;

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
    if (isPathHighlighted) {
        stroke = "#8b5cf6";
        strokeWidth = 3;
        opacity = 1;
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
                        onClick={() =>
                            onDisconnectStep(source, target, branchIndex)
                        }
                        style={{
                            position: "absolute",
                            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY + (label ? 16 : 0)}px)`,
                            pointerEvents: "all",
                            zIndex: 10,
                        }}
                        className="absolute z-10 flex size-5 items-center justify-center rounded-full bg-muted-foreground/70 text-white shadow-sm opacity-0 transition-opacity hover:bg-muted-foreground hover:opacity-100"
                        title={
                            edgeKind === "branch"
                                ? "Delete branch"
                                : "Remove connection"
                        }
                    >
                        <X className="size-3" aria-hidden="true" />
                    </button>
                )}
            </EdgeLabelRenderer>
        </>
    );
}

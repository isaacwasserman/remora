import { BaseEdge, type EdgeProps, Position } from "@xyflow/react";

export const DEPENDENCY_EDGE_COLOR =
    "var(--color-muted-foreground, var(--muted-foreground))";

const MIN_BULGE = 40;
const MAX_BULGE = 160;
const BULGE_PER_DISTANCE = 0.2;

/**
 * Both endpoints sit on the same side of their nodes, so the path bows
 * outward from that side instead of cutting across the chronological flow.
 */
function sideArcPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
}: Pick<
    EdgeProps,
    "sourceX" | "sourceY" | "targetX" | "targetY" | "sourcePosition"
>): string {
    if (sourcePosition === Position.Bottom) {
        const bulge = Math.min(
            MAX_BULGE,
            MIN_BULGE + Math.abs(targetX - sourceX) * BULGE_PER_DISTANCE,
        );
        const controlY = Math.max(sourceY, targetY) + bulge;
        return `M ${sourceX},${sourceY} C ${sourceX},${controlY} ${targetX},${controlY} ${targetX},${targetY}`;
    }
    const bulge = Math.min(
        MAX_BULGE,
        MIN_BULGE + Math.abs(targetY - sourceY) * BULGE_PER_DISTANCE,
    );
    const controlX = Math.max(sourceX, targetX) + bulge;
    return `M ${sourceX},${sourceY} C ${controlX},${sourceY} ${controlX},${targetY} ${targetX},${targetY}`;
}

export function DependencyEdge({
    id,
    markerEnd,
    style,
    ...geometry
}: EdgeProps) {
    return (
        <BaseEdge
            id={id}
            path={sideArcPath(geometry)}
            markerEnd={markerEnd}
            interactionWidth={0}
            style={{
                ...style,
                stroke: DEPENDENCY_EDGE_COLOR,
                strokeWidth: 1.5,
                opacity: 0.85,
            }}
        />
    );
}

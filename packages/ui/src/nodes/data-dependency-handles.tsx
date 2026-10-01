import { Handle, Position } from "@xyflow/react";
import type { LayoutDirection } from "../layout";

export const DATA_SOURCE_HANDLE_ID = "data-out";
export const DATA_TARGET_HANDLE_ID = "data-in";

const HIDDEN_HANDLE_STYLE = {
    opacity: 0,
    pointerEvents: "none",
    width: 1,
    height: 1,
    minWidth: 0,
    minHeight: 0,
    border: "none",
} as const;

/** Invisible anchors for data-dependency edges, on the side that runs parallel to the chronological flow. */
export function DataDependencyHandles({
    layoutDirection = "vertical",
}: {
    layoutDirection?: LayoutDirection;
}) {
    const isHorizontal = layoutDirection === "horizontal";
    const position = isHorizontal ? Position.Bottom : Position.Right;
    const offset = (fraction: number) =>
        isHorizontal
            ? { left: `${fraction * 100}%` }
            : { top: `${fraction * 100}%` };
    return (
        <>
            <Handle
                type="target"
                id={DATA_TARGET_HANDLE_ID}
                position={position}
                isConnectable={false}
                style={{ ...HIDDEN_HANDLE_STYLE, ...offset(0.35) }}
            />
            <Handle
                type="source"
                id={DATA_SOURCE_HANDLE_ID}
                position={position}
                isConnectable={false}
                style={{ ...HIDDEN_HANDLE_STYLE, ...offset(0.65) }}
            />
        </>
    );
}

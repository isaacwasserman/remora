import type { StepType, WorkflowStep } from "@remoraflow/core";
import { STEP_UI } from "../step-ui/registry";
import { NODE_HEIGHT, NODE_WIDTH } from "./constants";

const NODE_CHROME_HEIGHT = 78;
const ROW_HEIGHT = 20;
const DESC_LINE_HEIGHT = 16;

export function estimateStepHeight(step: WorkflowStep): number {
    const ui = STEP_UI[step.type as StepType];
    if (!ui) return NODE_HEIGHT;

    const descLines = step.description
        ? Math.min(Math.ceil(step.description.length / 40), 3)
        : 0;

    const nodeRows = (ui.nodeRows ?? []) as readonly string[];
    return (
        NODE_CHROME_HEIGHT +
        descLines * DESC_LINE_HEIGHT +
        nodeRows.length * ROW_HEIGHT
    );
}

export function getNodeDimensions(
    nodeId: string,
    groupIds: Set<string>,
    computedSizes: Map<string, { w: number; h: number }>,
    nodeDimensions?: Map<string, { width: number; height: number }>,
    stepMap?: Map<string, WorkflowStep>,
): { w: number; h: number } {
    if (groupIds.has(nodeId)) {
        return computedSizes.get(nodeId) ?? { w: NODE_WIDTH, h: NODE_HEIGHT };
    }
    const measured = nodeDimensions?.get(nodeId);
    if (measured) {
        return { w: measured.width, h: measured.height };
    }
    const step = stepMap?.get(nodeId);
    if (step) {
        return { w: NODE_WIDTH, h: estimateStepHeight(step) };
    }
    return { w: NODE_WIDTH, h: NODE_HEIGHT };
}

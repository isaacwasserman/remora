import type { WorkflowStep } from "../../schema";
import type { Tool, ToolSet } from "../../types";

function _constrainToolInput(
    _tool: Tool,
    _inputConstraint: (WorkflowStep & {
        type: "agent-loop";
    })["params"]["inputConstraints"],
) {
    throw new Error("NOT IMPLEMENTED");
}

export function constrainToolSetInputs(
    tools: ToolSet,
    inputConstraints: (WorkflowStep & {
        type: "agent-loop";
    })["params"]["inputConstraints"],
): ToolSet {
    if (!inputConstraints || Object.keys(inputConstraints).length === 0) {
        return tools;
    }
    // TODO: Implement this
    throw new Error("NOT IMPLEMENTED");
}

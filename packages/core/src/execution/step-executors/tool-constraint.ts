import type { WorkflowStep } from "../../schema";
import type { Tool, ToolSet } from "../../types";

function _constrainToolInput(
    _tool: Tool,
    _inputConstraint: (WorkflowStep & {
        type: "agent-loop";
    })["params"]["inputConstrains"],
) {
    throw new Error("NOT IMPLEMENTED");
}

export function constrainToolSetInputs(
    _tools: ToolSet,
    _inputConstraints: (WorkflowStep & {
        type: "agent-loop";
    })["params"]["inputConstraints"],
): ToolSet {
    // TODO: Implement this
    throw new Error("NOT IMPLEMENTED");
}

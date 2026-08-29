import { jsonSchemaToType } from "@ark/json-schema";
import { asSchema } from "ai";
import type { JsonSchema } from "arktype";
import type { WorkflowStep } from "../../schema";
import type { AnyTool, ToolSet } from "../../types";

function constrainToolInput(
    tool: AnyTool,
    inputConstraint: NonNullable<
        (WorkflowStep & {
            type: "agent-loop";
        })["params"]["inputConstraints"]
    >[string],
): AnyTool {
    const constrainedInputSchema = jsonSchemaToType(
        inputConstraint as JsonSchema,
    ).and(
        jsonSchemaToType(asSchema(tool.inputSchema).jsonSchema as JsonSchema),
    );
    const constrainedTool: AnyTool = {
        ...tool,
        inputSchema: constrainedInputSchema,
    };
    return constrainedTool;
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
    return Object.fromEntries(
        Object.entries(tools).map(([toolName, tool]) =>
            toolName in inputConstraints
                ? [
                      toolName,
                      // biome-ignore lint/style/noNonNullAssertion: key presence checked by `in`
                      constrainToolInput(tool, inputConstraints[toolName]!),
                  ]
                : [toolName, tool],
        ),
    );
}

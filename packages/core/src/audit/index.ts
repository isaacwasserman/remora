import type { JSONSchema7Definition } from "json-schema";
import { inferJsonSchema } from "..";
import type { WorkflowDefinition } from "../schema";
import { inferQueryOutputSchema } from "../schemistry/jmespath/infer";
import type { ToolSet } from "../types";
import {
    buildScopeSnapshotsById,
    scopeToJsonSchema,
} from "../validation/variable-reference-validation";
import type { WorkflowCapabilities } from "./capability";
import { templateToRegex } from "./utils";

export function auditWorkflow(
    workflowDefinition: WorkflowDefinition,
    tools: ToolSet,
): { capabilities: WorkflowCapabilities } {
    const toolInputSpaces: Record<
        string,
        WorkflowCapabilities["toolCalls"][number]["inputSpace"]
    > = {};
    function appendInputSpace(
        toolName: string,
        inputSpace: WorkflowCapabilities["toolCalls"][number]["inputSpace"],
    ) {
        if (toolName in toolInputSpaces) {
            toolInputSpaces[toolName] = {
                // biome-ignore lint/style/noNonNullAssertion: Known to exist
                anyOf: [toolInputSpaces[toolName]!, inputSpace],
            };
        } else {
            toolInputSpaces[toolName] = inputSpace;
        }
    }
    const scopeSnapshots = buildScopeSnapshotsById(workflowDefinition, tools);
    for (const step of workflowDefinition.steps) {
        switch (step.type) {
            case "tool-call": {
                const toolName = step.params.toolName;
                const paramExpressions = Object.entries(step.params.toolInput);
                const paramTypes: Record<string, JSONSchema7Definition> = {};
                for (const [paramName, paramExpression] of paramExpressions) {
                    switch (paramExpression.type) {
                        case "literal": {
                            paramTypes[paramName] = inferJsonSchema(
                                paramExpression.value,
                            );
                            break;
                        }
                        case "jmespath": {
                            paramTypes[paramName] = inferQueryOutputSchema(
                                scopeToJsonSchema(
                                    // biome-ignore lint/style/noNonNullAssertion: Known to exist
                                    scopeSnapshots.byStepId.get(step.id)!,
                                ),
                                paramExpression.expression,
                            ).schema;
                            break;
                        }
                        case "template": {
                            const regex = templateToRegex(
                                paramExpression.template,
                            );
                            paramTypes[paramName] = {
                                type: "string" as const,
                                pattern: regex,
                            };
                        }
                    }
                }
                const inputSpace = {
                    type: "object" as const,
                    properties: paramTypes,
                };
                appendInputSpace(toolName, inputSpace);
                break;
            }
            case "agent-loop": {
                for (const toolName of step.params.tools) {
                    if (toolName in (step.params.inputConstraints ?? {})) {
                        // biome-ignore lint/style/noNonNullAssertion: Known to exist
                        const inputConstraint = step.params.inputConstraints!;
                        appendInputSpace(toolName, inputConstraint);
                    } else {
                        appendInputSpace(toolName, true);
                    }
                }
                break;
            }
        }
    }
    return {
        capabilities: {
            toolCalls: Object.entries(toolInputSpaces).map(
                ([toolName, inputSpace]) => ({ toolName, inputSpace }),
            ),
        },
    };
}

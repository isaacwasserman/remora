import { jsonSchemaToType } from "@ark/json-schema";
import { asSchema, type FlexibleSchema } from "ai";
import type { JSONSchema7Definition } from "json-schema";
import { inferJsonSchema } from "..";
import type { WorkflowDefinition } from "../schema";
import { inferQueryOutputSchema } from "../schemistry/jmespath/infer";
import type { ToolSet } from "../types";
import {
    buildScopeSnapshotsById,
    scopeToJsonSchema,
} from "../validation/variable-reference-validation";
import type {
    ToolCallProvenance,
    ToolCallSource,
    WorkflowCapabilities,
} from "./capability";

export type {
    ToolCallProvenance,
    ToolCallSource,
    WorkflowCapabilities,
} from "./capability";

import { templateToRegex } from "./utils";

function simplifyInputSpace(
    inputSpace: JSONSchema7Definition,
): JSONSchema7Definition {
    try {
        return jsonSchemaToType(
            inputSpace as Parameters<typeof jsonSchemaToType>[0],
        ).toJsonSchema() as JSONSchema7Definition;
    } catch {
        // Some inferred JSON Schema fragments use constructs the ArkType
        // normalizer cannot represent. They are already valid audit output,
        // so retain them instead of failing the entire audit.
        return inputSpace;
    }
}

export function auditWorkflow(
    workflowDefinition: WorkflowDefinition,
    tools: ToolSet,
): { capabilities: WorkflowCapabilities } {
    const toolEntries: Record<
        string,
        Record<
            ToolCallProvenance,
            { inputSpace: JSONSchema7Definition; stepIds: string[] } | undefined
        >
    > = {};
    function appendInputSpace(
        toolName: string,
        inputSpace: JSONSchema7Definition,
        provenance: ToolCallProvenance,
        stepId: string,
    ) {
        if (!toolEntries[toolName]) {
            toolEntries[toolName] = {
                "tool-call": undefined,
                "agent-loop": undefined,
            };
        }
        const entry = toolEntries[toolName];
        const existing = entry[provenance];
        if (existing) {
            existing.inputSpace = { anyOf: [existing.inputSpace, inputSpace] };
            existing.stepIds.push(stepId);
        } else {
            entry[provenance] = { inputSpace, stepIds: [stepId] };
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
                appendInputSpace(toolName, inputSpace, "tool-call", step.id);
                break;
            }
            case "agent-loop": {
                for (const toolName of step.params.tools) {
                    if (toolName in (step.params.inputConstraints ?? {})) {
                        // biome-ignore lint/style/noNonNullAssertion: Known to exist
                        const inputConstraint = step.params.inputConstraints!;
                        appendInputSpace(
                            toolName,
                            inputConstraint,
                            "agent-loop",
                            step.id,
                        );
                    } else {
                        const tool = tools[toolName];
                        if (!tool) {
                            appendInputSpace(
                                toolName,
                                true,
                                "agent-loop",
                                step.id,
                            );
                        } else {
                            const inputSchema = asSchema(
                                tool.inputSchema as FlexibleSchema<unknown>,
                            ).jsonSchema;
                            if ("then" in inputSchema) {
                                throw new Error(
                                    `Input schema for tool "${toolName}" is a promise. All input schemas must be synchronously defined.`,
                                );
                            }
                            appendInputSpace(
                                toolName,
                                inputSchema,
                                "agent-loop",
                                step.id,
                            );
                        }
                    }
                }
                break;
            }
        }
    }
    return {
        capabilities: {
            toolCalls: Object.entries(toolEntries).map(([toolName, entry]) => {
                const sources: ToolCallSource[] = [];
                for (const provenance of ["tool-call", "agent-loop"] as const) {
                    const bucket = entry[provenance];
                    if (bucket !== undefined) {
                        sources.push({
                            provenance,
                            inputSpace: simplifyInputSpace(bucket.inputSpace),
                            stepIds: bucket.stepIds,
                        });
                    }
                }
                return { toolName, sources };
            }),
        },
    };
}

import type { StubbedToolSet, ToolDefinitionMap } from "@remoraflow/core";
import { type JSONSchema7, jsonSchema } from "ai";

export function buildStubTools(toolSchemas: ToolDefinitionMap): StubbedToolSet {
    const stubs: Record<string, unknown> = {};
    for (const [name, schema] of Object.entries(toolSchemas)) {
        stubs[name] = {
            inputSchema: jsonSchema(
                schema.inputSchema as unknown as JSONSchema7,
            ),
            outputSchema: schema.outputSchema
                ? jsonSchema(schema.outputSchema as unknown as JSONSchema7)
                : undefined,
            description: schema.description,
        };
    }
    return stubs as unknown as StubbedToolSet;
}

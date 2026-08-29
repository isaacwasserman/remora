import type { ToolDefinitionMap } from "@remoraflow/core";
import { type JSONSchema7, jsonSchema, type ToolSet } from "ai";

/**
 * Builds a non-executable {@link ToolSet} from extracted tool schemas so that
 * {@link validateWorkflowDefinition} can run fully client-side. The stubs carry
 * the real input/output JSON schemas (so tool-reference, tool-input, and
 * variable-reference validation behave identically) but throw on execution,
 * which is never reached during validation.
 */
export function buildStubTools(toolSchemas: ToolDefinitionMap): ToolSet {
    const stubs: Record<string, unknown> = {};
    for (const [name, schema] of Object.entries(toolSchemas)) {
        stubs[name] = {
            inputSchema: jsonSchema(
                schema.inputSchema as unknown as JSONSchema7,
            ),
            outputSchema: schema.outputSchema
                ? jsonSchema(schema.outputSchema as unknown as JSONSchema7)
                : undefined,
            execute: async () => {
                throw new Error(`Stub tool "${name}" is not executable`);
            },
        };
    }
    return stubs as unknown as ToolSet;
}

import type { WorkflowDefinition } from "../../types";
import type { Diagnostic, ExecutionGraph, ToolDefinitionMap } from "../types";
import { getSchemaType, resolveExpressionSchema } from "../utils/schema";

/**
 * Validate that tool input values are type-compatible with the tool's
 * JSON Schema. Checks literal values, JMESPath expressions (simple dotted
 * paths only), and string templates.
 */
export function validateToolInputTypes(
  workflow: WorkflowDefinition,
  graph: ExecutionGraph,
  tools: ToolDefinitionMap,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const step of workflow.steps) {
    if (step.type !== "tool-call") continue;

    const toolDef = tools[step.params.toolName];
    if (!toolDef?.inputSchema.properties) continue;

    const schemaProps = toolDef.inputSchema.properties as Record<
      string,
      Record<string, unknown>
    >;

    for (const [key, expr] of Object.entries(step.params.toolInput)) {
      const propSchema = schemaProps[key];
      if (!propSchema) continue;

      const expectedType = getSchemaType(propSchema);
      if (!expectedType) continue;

      const exprObj = expr as {
        type: string;
        value?: unknown;
        expression?: string;
        template?: string;
      };

      if (exprObj.type === "literal") {
        const actualType = getValueType(exprObj.value);
        if (!isTypeCompatible(actualType, expectedType)) {
          diagnostics.push({
            severity: "error",
            location: {
              stepId: step.id,
              field: `params.toolInput.${key}`,
            },
            message: `Step '${step.id}' input '${key}' has literal type '${actualType}' but tool expects '${expectedType}'`,
            code: "TOOL_INPUT_TYPE_MISMATCH",
          });
        }
      } else if (exprObj.type === "jmespath" && exprObj.expression) {
        const resolvedSchema = resolveExpressionSchema(
          exprObj.expression,
          step.id,
          tools,
          workflow,
          graph,
        );
        if (resolvedSchema) {
          const resolvedType = getSchemaType(resolvedSchema);
          if (resolvedType && !isTypeCompatible(resolvedType, expectedType)) {
            diagnostics.push({
              severity: "error",
              location: {
                stepId: step.id,
                field: `params.toolInput.${key}`,
              },
              message: `Step '${step.id}' input '${key}' expression '${exprObj.expression}' resolves to type '${resolvedType}' but tool expects '${expectedType}'`,
              code: "TOOL_INPUT_TYPE_MISMATCH",
            });
          }
        }
      } else if (exprObj.type === "template") {
        // Templates always produce strings
        if (expectedType !== "string") {
          diagnostics.push({
            severity: "error",
            location: {
              stepId: step.id,
              field: `params.toolInput.${key}`,
            },
            message: `Step '${step.id}' input '${key}' uses a string template but tool expects '${expectedType}'`,
            code: "TOOL_INPUT_TYPE_MISMATCH",
          });
        }
      }
    }
  }

  return diagnostics;
}

function getValueType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

/** Check if an actual type is compatible with the expected schema type. */
function isTypeCompatible(actual: string, expected: string): boolean {
  if (actual === expected) return true;
  // integer accepts number values
  if (expected === "integer" && actual === "number") return true;
  return false;
}

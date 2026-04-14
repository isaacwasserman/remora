import type { WorkflowDefinition } from "../../types";
import type { Diagnostic, ExecutionGraph, ToolDefinitionMap } from "../types";
import { resolveExpressionPath } from "../utils/schema";
import { collectExpressions } from "./validate-jmespath";

/**
 * Validate that property paths in JMESPath expressions reference properties
 * that actually exist in the referenced step's output schema.
 *
 * Only validates simple dotted paths (e.g. `stepId.field.nested`). Complex
 * expressions (filters, projections, functions) are silently skipped.
 * Steps without a known output schema are also skipped.
 */
export function validateExpressionPaths(
  workflow: WorkflowDefinition,
  graph: ExecutionGraph,
  tools: ToolDefinitionMap | null,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const { expressions } = collectExpressions(workflow);

  for (const expr of expressions) {
    const result = resolveExpressionPath(
      expr.expression,
      expr.stepId,
      tools,
      workflow,
      graph,
    );

    if (result.status === "property_not_found") {
      const parentProps = result.parentSchema.properties as
        | Record<string, unknown>
        | undefined;
      const available = parentProps ? Object.keys(parentProps) : [];
      const hint =
        available.length > 0
          ? ` Available properties: ${available.map((p) => `'${p}'`).join(", ")}`
          : "";

      diagnostics.push({
        severity: "warning",
        location: { stepId: expr.stepId, field: expr.field },
        message: `Expression '${expr.expression}' references property '${result.failedAtSegment}' which does not exist in the output schema.${hint}`,
        code: "JMESPATH_INVALID_PROPERTY_PATH",
      });
    }
  }

  return diagnostics;
}

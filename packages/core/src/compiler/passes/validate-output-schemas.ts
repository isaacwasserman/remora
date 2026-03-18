import type { WorkflowDefinition } from "../../types";
import type { Diagnostic } from "../types";

/**
 * Warn about JSON Schema keywords in outputFormat that are not supported
 * by most LLM structured output APIs (e.g. minItems > 1, maxItems, pattern).
 */
export function validateOutputSchemas(
  workflow: WorkflowDefinition,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const step of workflow.steps) {
    if (
      step.type !== "llm-prompt" &&
      step.type !== "extract-data" &&
      step.type !== "agent-loop"
    ) {
      continue;
    }

    const outputFormat = step.params.outputFormat;
    if (!outputFormat || typeof outputFormat !== "object") continue;

    collectUnsupported(
      outputFormat as Record<string, unknown>,
      step.id,
      "params.outputFormat",
      diagnostics,
    );
  }

  return diagnostics;
}

/** Keywords that are unconditionally unsupported and will be stripped at runtime. */
const UNSUPPORTED_KEYWORDS = new Set([
  "maxItems",
  "minLength",
  "maxLength",
  "minProperties",
  "maxProperties",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "pattern",
  "uniqueItems",
]);

function collectUnsupported(
  schema: Record<string, unknown>,
  stepId: string,
  path: string,
  diagnostics: Diagnostic[],
): void {
  for (const [key, value] of Object.entries(schema)) {
    if (UNSUPPORTED_KEYWORDS.has(key)) {
      diagnostics.push({
        severity: "warning",
        location: { stepId, field: `${path}.${key}` },
        message: `Step '${stepId}' outputFormat uses '${key}' (value: ${JSON.stringify(value)}) which is not supported by most LLM providers and will be stripped at runtime`,
        code: "UNSUPPORTED_SCHEMA_KEYWORD",
      });
    }

    // minItems > 1 is unsupported (0 and 1 are fine)
    if (key === "minItems" && typeof value === "number" && value > 1) {
      diagnostics.push({
        severity: "warning",
        location: { stepId, field: `${path}.minItems` },
        message: `Step '${stepId}' outputFormat uses 'minItems' with value ${value} but only 0 and 1 are supported; it will be stripped at runtime`,
        code: "UNSUPPORTED_SCHEMA_KEYWORD",
      });
    }

    // Recurse into nested schemas
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      collectUnsupported(
        value as Record<string, unknown>,
        stepId,
        `${path}.${key}`,
        diagnostics,
      );
    }
  }
}

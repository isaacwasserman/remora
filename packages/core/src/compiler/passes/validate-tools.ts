import type { WorkflowDefinition } from "../../types";
import type { Diagnostic, ToolDefinitionMap } from "../types";

export function validateTools(
  workflow: WorkflowDefinition,
  tools: ToolDefinitionMap,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const step of workflow.steps) {
    if (step.type === "tool-call") {
      const { toolName, toolInput } = step.params;

      // Check tool exists
      const toolDef = tools[toolName];
      if (!toolDef) {
        diagnostics.push({
          severity: "error",
          location: { stepId: step.id, field: "params.toolName" },
          message: `Step '${step.id}' references unknown tool '${toolName}'`,
          code: "UNKNOWN_TOOL",
        });
        continue; // Can't validate inputs for unknown tool
      }

      const schemaProperties = toolDef.inputSchema.properties ?? {};
      const requiredKeys = new Set(toolDef.inputSchema.required ?? []);
      const definedKeys = new Set(Object.keys(schemaProperties));
      const providedKeys = new Set(Object.keys(toolInput));

      // Check for extra keys (provided but not in schema)
      for (const key of providedKeys) {
        if (!definedKeys.has(key)) {
          diagnostics.push({
            severity: "warning",
            location: {
              stepId: step.id,
              field: `params.toolInput.${key}`,
            },
            message: `Step '${step.id}' provides input key '${key}' which is not defined in tool '${toolName}' schema`,
            code: "EXTRA_TOOL_INPUT_KEY",
          });
        }
      }

      // Check for missing required keys
      for (const key of requiredKeys) {
        if (!providedKeys.has(key)) {
          diagnostics.push({
            severity: "error",
            location: { stepId: step.id, field: "params.toolInput" },
            message: `Step '${step.id}' is missing required input key '${key}' for tool '${toolName}'`,
            code: "MISSING_TOOL_INPUT_KEY",
          });
        }
      }
    }

    // Validate tool references in agent-loop steps
    if (step.type === "agent-loop") {
      for (const [i, toolName] of step.params.tools.entries()) {
        if (!tools[toolName]) {
          diagnostics.push({
            severity: "error",
            location: {
              stepId: step.id,
              field: `params.tools[${i}]`,
            },
            message: `Step '${step.id}' references unknown tool '${toolName}'`,
            code: "UNKNOWN_TOOL",
          });
        }
      }
    }
  }

  return diagnostics;
}

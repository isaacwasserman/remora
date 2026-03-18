import { safeValidateTypes } from "@ai-sdk/provider-utils";
import type { ToolSet } from "ai";
import type { WorkflowStep } from "../../types";
import {
  ConfigurationError,
  ExternalServiceError,
  ValidationError,
} from "../errors";
import type { Expression } from "../executor-types";
import { evaluateExpression } from "../helpers";

export async function executeToolCall(
  step: WorkflowStep & { type: "tool-call" },
  scope: Record<string, unknown>,
  tools: ToolSet,
): Promise<unknown> {
  // Tool existence and executability are validated in pre-flight checks
  const toolDef = tools[step.params.toolName];
  if (!toolDef?.execute) {
    throw new ConfigurationError(
      step.id,
      "TOOL_NOT_FOUND",
      `Tool '${step.params.toolName}' not found or has no execute function`,
    );
  }

  const resolvedInput: Record<string, unknown> = {};
  for (const [key, expr] of Object.entries(step.params.toolInput)) {
    resolvedInput[key] = evaluateExpression(expr as Expression, scope, step.id);
  }

  if (toolDef.inputSchema) {
    const validation = await safeValidateTypes({
      value: resolvedInput,
      schema: toolDef.inputSchema,
    });
    if (!validation.success) {
      throw new ValidationError(
        step.id,
        "TOOL_INPUT_VALIDATION_FAILED",
        `Tool '${step.params.toolName}' input validation failed: ${validation.error.message}`,
        resolvedInput,
        validation.error,
      );
    }
  }

  try {
    return await toolDef.execute(resolvedInput, {
      toolCallId: step.id,
      messages: [],
    });
  } catch (e) {
    throw new ExternalServiceError(
      step.id,
      "TOOL_EXECUTION_FAILED",
      e instanceof Error ? e.message : String(e),
      e,
    );
  }
}

export function resolveToolCallInputs(
  step: WorkflowStep & { type: "tool-call" },
  scope: Record<string, unknown>,
): unknown {
  const resolved: Record<string, unknown> = {};
  for (const [key, expr] of Object.entries(step.params.toolInput)) {
    try {
      resolved[key] = evaluateExpression(expr as Expression, scope, step.id);
    } catch {
      resolved[key] = `<error resolving ${key}>`;
    }
  }
  return resolved;
}

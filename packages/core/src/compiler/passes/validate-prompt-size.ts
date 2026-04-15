import { estimateTokenCount } from "tokenx";
import { MAXIMUM_PROMPT_LENGTH } from "../../prompt-size";
import type { WorkflowDefinition } from "../../types";
import type { CompilerLimits, Diagnostic } from "../types";

/**
 * Validates that prompt templates in llm-prompt and agent-loop steps
 * do not exceed the configured maximum token limit at compile time.
 *
 * This checks the raw template string (before variable interpolation).
 * If the template itself already exceeds the limit, variable substitution
 * will only make it larger, so this is caught early as a compile error.
 */
export function validatePromptSize(
  workflow: WorkflowDefinition,
  limits?: CompilerLimits,
): Diagnostic[] {
  const maxTokens = limits?.maxPromptTokens ?? MAXIMUM_PROMPT_LENGTH;
  const diagnostics: Diagnostic[] = [];

  for (const step of workflow.steps) {
    if (step.type === "llm-prompt") {
      const tokenCount = estimateTokenCount(step.params.prompt);
      if (tokenCount > maxTokens) {
        diagnostics.push({
          severity: "error",
          location: { stepId: step.id, field: "params.prompt" },
          message: `Prompt template is ~${tokenCount} tokens, which exceeds the maximum of ${maxTokens} tokens. Reduce the template size or increase maxPromptTokens.`,
          code: "PROMPT_TEMPLATE_EXCEEDS_TOKEN_LIMIT",
        });
      }
    }

    if (step.type === "agent-loop") {
      const tokenCount = estimateTokenCount(step.params.instructions);
      if (tokenCount > maxTokens) {
        diagnostics.push({
          severity: "error",
          location: { stepId: step.id, field: "params.instructions" },
          message: `Agent-loop instructions template is ~${tokenCount} tokens, which exceeds the maximum of ${maxTokens} tokens. Reduce the template size or increase maxPromptTokens.`,
          code: "PROMPT_TEMPLATE_EXCEEDS_TOKEN_LIMIT",
        });
      }
    }
  }

  return diagnostics;
}

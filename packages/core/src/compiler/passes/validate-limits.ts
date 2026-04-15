import { MAXIMUM_PROMPT_LENGTH } from "../../prompt-size";
import type { WorkflowDefinition } from "../../types";
import type { CompilerLimits, Diagnostic } from "../types";

const DEFAULT_LIMITS: Required<CompilerLimits> = {
  maxAttempts: Number.POSITIVE_INFINITY,
  maxSleepMs: 300_000, // 5 minutes
  maxBackoffMultiplier: 2,
  minBackoffMultiplier: 1,
  maxTimeoutMs: 600_000, // 10 minutes
  maxPromptTokens: MAXIMUM_PROMPT_LENGTH,
};

/**
 * Validates literal values in sleep/wait-for-condition steps against
 * configured upper/lower bounds. Only checks expressions with
 * type === 'literal' — JMESPath expressions are unknown at compile time.
 */
export function validateLimits(
  workflow: WorkflowDefinition,
  limits?: CompilerLimits,
): Diagnostic[] {
  const resolved = { ...DEFAULT_LIMITS, ...limits };
  const diagnostics: Diagnostic[] = [];

  for (const step of workflow.steps) {
    if (step.type === "sleep") {
      const expr = step.params.durationMs;
      if (expr.type === "literal" && typeof expr.value === "number") {
        if (expr.value > resolved.maxSleepMs) {
          diagnostics.push({
            severity: "error",
            location: { stepId: step.id, field: "params.durationMs" },
            message: `Sleep duration ${expr.value}ms exceeds limit of ${resolved.maxSleepMs}ms`,
            code: "SLEEP_DURATION_EXCEEDS_LIMIT",
          });
        }
      }
    }

    if (step.type === "wait-for-condition") {
      const { maxAttempts, intervalMs, backoffMultiplier, timeoutMs } =
        step.params;

      if (
        maxAttempts?.type === "literal" &&
        typeof maxAttempts.value === "number"
      ) {
        if (maxAttempts.value > resolved.maxAttempts) {
          diagnostics.push({
            severity: "error",
            location: { stepId: step.id, field: "params.maxAttempts" },
            message: `maxAttempts ${maxAttempts.value} exceeds limit of ${resolved.maxAttempts}`,
            code: "WAIT_ATTEMPTS_EXCEEDS_LIMIT",
          });
        }
      }

      if (
        intervalMs?.type === "literal" &&
        typeof intervalMs.value === "number"
      ) {
        if (intervalMs.value > resolved.maxSleepMs) {
          diagnostics.push({
            severity: "error",
            location: { stepId: step.id, field: "params.intervalMs" },
            message: `intervalMs ${intervalMs.value}ms exceeds limit of ${resolved.maxSleepMs}ms`,
            code: "WAIT_INTERVAL_EXCEEDS_LIMIT",
          });
        }
      }

      if (
        backoffMultiplier?.type === "literal" &&
        typeof backoffMultiplier.value === "number"
      ) {
        if (
          backoffMultiplier.value < resolved.minBackoffMultiplier ||
          backoffMultiplier.value > resolved.maxBackoffMultiplier
        ) {
          diagnostics.push({
            severity: "error",
            location: { stepId: step.id, field: "params.backoffMultiplier" },
            message: `backoffMultiplier ${backoffMultiplier.value} is outside allowed range [${resolved.minBackoffMultiplier}, ${resolved.maxBackoffMultiplier}]`,
            code: "BACKOFF_MULTIPLIER_OUT_OF_RANGE",
          });
        }
      }

      if (
        timeoutMs?.type === "literal" &&
        typeof timeoutMs.value === "number"
      ) {
        if (timeoutMs.value > resolved.maxTimeoutMs) {
          diagnostics.push({
            severity: "error",
            location: { stepId: step.id, field: "params.timeoutMs" },
            message: `timeoutMs ${timeoutMs.value}ms exceeds limit of ${resolved.maxTimeoutMs}ms`,
            code: "WAIT_TIMEOUT_EXCEEDS_LIMIT",
          });
        }
      }
    }
  }

  return diagnostics;
}

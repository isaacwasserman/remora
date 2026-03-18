import type { WorkflowStep } from "../../types";
import type { DurableContext } from "../context";
import { ValidationError } from "../errors";
import type { ExecutionTimer, Expression } from "../executor-types";
import { evaluateExpression } from "../helpers";

export async function executeSleep(
  step: WorkflowStep & { type: "sleep" },
  scope: Record<string, unknown>,
  context: DurableContext,
  timer: ExecutionTimer,
): Promise<void> {
  const durationMs = evaluateExpression(
    step.params.durationMs as Expression,
    scope,
    step.id,
  );
  if (typeof durationMs !== "number" || durationMs < 0) {
    throw new ValidationError(
      step.id,
      "SLEEP_INVALID_DURATION",
      `sleep durationMs must be a non-negative number, got ${typeof durationMs === "number" ? durationMs : typeof durationMs}`,
      durationMs,
    );
  }
  const clamped = Math.min(durationMs, timer.resolvedLimits.maxSleepMs);
  await context.sleep(step.id, clamped);
}

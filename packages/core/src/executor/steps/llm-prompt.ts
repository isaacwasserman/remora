import { jsonSchema, Output, stepCountIs, ToolLoopAgent } from "ai";
import type { WorkflowStep } from "../../types";
import { ConfigurationError, StepExecutionError } from "../errors";
import {
  DEFAULT_EXECUTOR_LIMITS,
  type ExecutorLimits,
  type ResolvedExecuteWorkflowOptions,
} from "../executor-types";
import { classifyLlmError, interpolateTemplate } from "../helpers";
import { interpolateTemplateWithLimits } from "../prompt-truncation";
import { sanitizeOutputSchema } from "../sanitize-output-schema";
import type { TraceEntry } from "../state";

export async function executeLlmPrompt(
  step: WorkflowStep & { type: "llm-prompt" },
  scope: Record<string, unknown>,
  options: ResolvedExecuteWorkflowOptions,
  limits?: Required<ExecutorLimits>,
): Promise<{ output: unknown; trace?: TraceEntry[] }> {
  if (!options.model) {
    throw new ConfigurationError(
      step.id,
      "AGENT_NOT_PROVIDED",
      "llm-prompt steps require a LanguageModel to be provided",
    );
  }

  const resolvedLimits = limits ?? {
    ...DEFAULT_EXECUTOR_LIMITS,
    ...options.limits,
  };
  const prompt = interpolateTemplateWithLimits(
    step.params.prompt,
    scope,
    step.id,
    resolvedLimits,
  );

  const agent = new ToolLoopAgent({
    model: options.model,
    output: Output.object({
      schema: jsonSchema(
        sanitizeOutputSchema(
          step.params.outputFormat as Parameters<typeof jsonSchema>[0],
        ),
      ),
    }),
    stopWhen: stepCountIs(1),
  });

  try {
    const result = await agent.generate({ prompt });
    const trace: TraceEntry[] = result.steps.map((s) => ({
      type: "agent-step" as const,
      step: s,
    }));
    return { output: result.output, trace };
  } catch (e) {
    if (e instanceof StepExecutionError) throw e;
    throw classifyLlmError(step.id, e);
  }
}

export function resolveLlmPromptInputs(
  step: WorkflowStep & { type: "llm-prompt" },
  scope: Record<string, unknown>,
): unknown {
  try {
    return {
      prompt: interpolateTemplate(step.params.prompt, scope, step.id),
    };
  } catch {
    return { prompt: step.params.prompt };
  }
}

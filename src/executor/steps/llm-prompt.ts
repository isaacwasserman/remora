import { jsonSchema, Output, stepCountIs, ToolLoopAgent } from "ai";
import type { WorkflowStep } from "../../types";
import { ConfigurationError, StepExecutionError } from "../errors";
import type { ResolvedExecuteWorkflowOptions } from "../executor-types";
import { classifyLlmError, interpolateTemplate } from "../helpers";
import type { TraceEntry } from "../state";

export async function executeLlmPrompt(
	step: WorkflowStep & { type: "llm-prompt" },
	scope: Record<string, unknown>,
	options: ResolvedExecuteWorkflowOptions,
): Promise<{ output: unknown; trace?: TraceEntry[] }> {
	if (!options.model) {
		throw new ConfigurationError(
			step.id,
			"AGENT_NOT_PROVIDED",
			"llm-prompt steps require a LanguageModel to be provided",
		);
	}

	const prompt = interpolateTemplate(step.params.prompt, scope, step.id);

	const agent = new ToolLoopAgent({
		model: options.model,
		output: Output.object({
			schema: jsonSchema(
				step.params.outputFormat as Parameters<typeof jsonSchema>[0],
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

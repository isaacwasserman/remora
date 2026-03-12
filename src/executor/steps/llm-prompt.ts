import type { Agent } from "ai";
import type { WorkflowStep } from "../../types";
import { OutputQualityError, StepExecutionError } from "../errors";
import {
	classifyLlmError,
	interpolateTemplate,
	stripCodeFence,
} from "../helpers";

export async function executeLlmPrompt(
	step: WorkflowStep & { type: "llm-prompt" },
	scope: Record<string, unknown>,
	agent: Agent,
): Promise<unknown> {
	const interpolatedPrompt = interpolateTemplate(
		step.params.prompt,
		scope,
		step.id,
	);
	const schemaStr = JSON.stringify(step.params.outputFormat, null, 2);
	const prompt = `${interpolatedPrompt}\n\nYou must respond with valid JSON matching this JSON Schema:\n${schemaStr}\n\nRespond ONLY with the JSON object, no other text.`;
	try {
		const result = await agent.generate({ prompt });
		return JSON.parse(stripCodeFence(result.text));
	} catch (e) {
		if (e instanceof StepExecutionError) throw e;
		if (e instanceof SyntaxError) {
			throw new OutputQualityError(
				step.id,
				"LLM_OUTPUT_PARSE_ERROR",
				`LLM output is not valid JSON: ${e.message}`,
				undefined,
				e,
			);
		}
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

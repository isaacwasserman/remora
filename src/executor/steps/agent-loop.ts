import type { Agent, ToolSet } from "ai";
import { stepCountIs, ToolLoopAgent } from "ai";
import type { WorkflowStep } from "../../types";
import {
	ConfigurationError,
	ExtractionError,
	OutputQualityError,
	StepExecutionError,
	ValidationError,
} from "../errors";
import type {
	ExecutorLimits,
	Expression,
	ResolvedExecuteWorkflowOptions,
} from "../executor-types";
import {
	classifyLlmError,
	createGiveUpTool,
	createProbeDataTool,
	evaluateExpression,
	interpolateTemplate,
	stripCodeFence,
} from "../helpers";

export async function executeAgentLoop(
	step: WorkflowStep & { type: "agent-loop" },
	scope: Record<string, unknown>,
	options: ResolvedExecuteWorkflowOptions,
	limits: Required<ExecutorLimits>,
): Promise<unknown> {
	if (!options.agent) {
		throw new ConfigurationError(
			step.id,
			"AGENT_NOT_PROVIDED",
			"agent-loop steps require an agent or LanguageModel to be provided",
		);
	}

	const interpolatedInstructions = interpolateTemplate(
		step.params.instructions,
		scope,
		step.id,
	);

	// If a LanguageModel was provided, create a ToolLoopAgent with the
	// specified tool subset. If a pre-configured Agent was provided, use
	// it directly (the tools list in the step is ignored — the Agent is
	// assumed to already have the tools it needs).
	let agent: Agent;
	let giveUp: ReturnType<typeof createGiveUpTool> | undefined;
	if (options._rawModel) {
		// Subset tools to only those listed in step.params.tools
		const subsetTools: ToolSet = {};
		for (const toolName of step.params.tools) {
			const toolDef = options.tools[toolName];
			if (!toolDef) {
				throw new ConfigurationError(
					step.id,
					"TOOL_NOT_FOUND",
					`agent-loop step references tool '${toolName}' which is not in the provided tool set`,
				);
			}
			if (!toolDef.execute) {
				throw new ConfigurationError(
					step.id,
					"TOOL_MISSING_EXECUTE",
					`agent-loop step references tool '${toolName}' which has no execute function`,
				);
			}
			subsetTools[toolName] = toolDef;
		}

		// Inject built-in probe-data and give-up tools
		const probeDataTool = createProbeDataTool(scope, limits);
		giveUp = createGiveUpTool();
		subsetTools["probe-data"] = probeDataTool;
		subsetTools["give-up"] = giveUp.tool;

		// Evaluate maxSteps (default: 10)
		const maxSteps = step.params.maxSteps
			? evaluateExpression(step.params.maxSteps as Expression, scope, step.id)
			: 10;
		if (typeof maxSteps !== "number" || maxSteps < 1) {
			throw new ValidationError(
				step.id,
				"TOOL_INPUT_VALIDATION_FAILED",
				`agent-loop maxSteps must be a positive number, got ${typeof maxSteps === "number" ? maxSteps : typeof maxSteps}`,
				maxSteps,
			);
		}

		agent = new ToolLoopAgent({
			model: options._rawModel,
			tools: subsetTools,
			stopWhen: [
				() => giveUp?.getReason() !== undefined,
				stepCountIs(Math.floor(maxSteps)),
			],
		});
	} else {
		// Pre-configured Agent — use it directly, ignoring the step's tools list
		agent = options.agent as Agent;
	}

	const schemaStr = JSON.stringify(step.params.outputFormat, null, 2);
	const prompt = `${interpolatedInstructions}\n\nWhen you have completed the task, respond with valid JSON matching this JSON Schema:\n${schemaStr}\n\nRespond ONLY with the JSON object as your final answer, no other text.`;

	try {
		const result = await agent.generate({ prompt });

		// Check if the agent gave up before trying to parse JSON output
		if (giveUp?.getReason() !== undefined) {
			throw new ExtractionError(
				step.id,
				`Agent gave up: ${giveUp.getReason()}`,
				giveUp.getReason() as string,
			);
		}

		return JSON.parse(stripCodeFence(result.text));
	} catch (e) {
		if (e instanceof StepExecutionError) throw e;
		if (e instanceof SyntaxError) {
			throw new OutputQualityError(
				step.id,
				"LLM_OUTPUT_PARSE_ERROR",
				`agent-loop output is not valid JSON: ${e.message}`,
				undefined,
				e,
			);
		}
		throw classifyLlmError(step.id, e);
	}
}

export function resolveAgentLoopInputs(
	step: WorkflowStep & { type: "agent-loop" },
	scope: Record<string, unknown>,
): unknown {
	try {
		return {
			instructions: interpolateTemplate(
				step.params.instructions,
				scope,
				step.id,
			),
		};
	} catch {
		return { instructions: step.params.instructions };
	}
}

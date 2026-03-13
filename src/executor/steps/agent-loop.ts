import type { ToolSet } from "ai";
import { jsonSchema, Output, stepCountIs, ToolLoopAgent } from "ai";
import type { WorkflowStep } from "../../types";
import {
	ConfigurationError,
	ExtractionError,
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
} from "../helpers";

export async function executeAgentLoop(
	step: WorkflowStep & { type: "agent-loop" },
	scope: Record<string, unknown>,
	options: ResolvedExecuteWorkflowOptions,
	limits: Required<ExecutorLimits>,
): Promise<unknown> {
	if (!options.model) {
		throw new ConfigurationError(
			step.id,
			"AGENT_NOT_PROVIDED",
			"agent-loop steps require a LanguageModel to be provided",
		);
	}

	const interpolatedInstructions = interpolateTemplate(
		step.params.instructions,
		scope,
		step.id,
	);

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
	const giveUp = createGiveUpTool();
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

	const agent = new ToolLoopAgent({
		model: options.model,
		tools: subsetTools,
		output: Output.object({
			schema: jsonSchema(
				step.params.outputFormat as Parameters<typeof jsonSchema>[0],
			),
		}),
		stopWhen: [
			() => giveUp?.getReason() !== undefined,
			stepCountIs(Math.floor(maxSteps)),
		],
	});

	try {
		const result = await agent.generate({ prompt: interpolatedInstructions });

		// Check if the agent gave up before returning structured output
		if (giveUp.getReason() !== undefined) {
			throw new ExtractionError(
				step.id,
				`Agent gave up: ${giveUp.getReason()}`,
				giveUp.getReason() as string,
			);
		}

		return result.output;
	} catch (e) {
		if (e instanceof StepExecutionError) throw e;
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

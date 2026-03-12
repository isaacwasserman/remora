import { safeValidateTypes } from "@ai-sdk/provider-utils";
import { search } from "@jmespath-community/jmespath";
import {
	type Agent,
	jsonSchema,
	type LanguageModel,
	stepCountIs,
	ToolLoopAgent,
	tool,
} from "ai";
import type { WorkflowStep } from "../../types";
import {
	ConfigurationError,
	ExtractionError,
	OutputQualityError,
	StepExecutionError,
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
	stripCodeFence,
} from "../helpers";
import { summarizeObjectStructure } from "../schema-inference";

export async function executeExtractData(
	step: WorkflowStep & { type: "extract-data" },
	scope: Record<string, unknown>,
	options: ResolvedExecuteWorkflowOptions,
	limits: Required<ExecutorLimits>,
): Promise<unknown> {
	if (!options.agent) {
		throw new ConfigurationError(
			step.id,
			"AGENT_NOT_PROVIDED",
			"extract-data steps require an agent or LanguageModel to be provided",
		);
	}

	const sourceData = evaluateExpression(
		step.params.sourceData as Expression,
		scope,
		step.id,
	);
	const sourceStr =
		typeof sourceData === "string"
			? sourceData
			: JSON.stringify(sourceData, null, 2);

	// Determine if we need probe mode: data is large, we have a raw model,
	// and the source data is structured (not plain text)
	const byteLength = new TextEncoder().encode(sourceStr).byteLength;
	let useProbeMode =
		byteLength > limits.probeThresholdBytes && !!options._rawModel;

	// If source data is a string, check if it's parseable JSON — probe mode
	// needs structured data for schema inference and JMESPath queries
	if (useProbeMode && typeof sourceData === "string") {
		try {
			JSON.parse(sourceData);
		} catch {
			useProbeMode = false;
		}
	}

	if (useProbeMode) {
		const structuredData =
			typeof sourceData === "string" ? JSON.parse(sourceData) : sourceData;
		return executeExtractDataProbe(step, structuredData, options, limits);
	}

	// Inline mode: send all data in the prompt
	const schemaStr = JSON.stringify(step.params.outputFormat, null, 2);
	const prompt = `Extract the following structured data from the provided source data.\n\nSource data:\n${sourceStr}\n\nYou must respond with valid JSON matching this JSON Schema:\n${schemaStr}\n\nRespond ONLY with the JSON object, no other text.`;
	try {
		const result = await (options.agent as Agent).generate({ prompt });
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

async function executeExtractDataProbe(
	step: WorkflowStep & { type: "extract-data" },
	sourceData: unknown,
	options: ResolvedExecuteWorkflowOptions,
	limits: Required<ExecutorLimits>,
): Promise<unknown> {
	const structureSummary = summarizeObjectStructure(sourceData as object, 2);

	// Closure variable for capturing submit-result output
	let submittedResult: unknown;

	const outputSchema = jsonSchema(
		step.params.outputFormat as Parameters<typeof jsonSchema>[0],
	);

	const probeDataTool = createProbeDataTool(sourceData, limits);
	const giveUp = createGiveUpTool();

	const submitResultTool = tool({
		description:
			"Submit the extracted data. Provide either `data` (the object directly) or `expression` (a JMESPath expression that evaluates to it). The result is validated against the target schema.",
		inputSchema: jsonSchema<{ data?: unknown; expression?: string }>({
			type: "object" as const,
			properties: {
				data: { description: "The extracted data object directly" },
				expression: {
					type: "string" as const,
					description:
						"A JMESPath expression that evaluates to the extracted data",
				},
			},
		}),
		execute: async (input) => {
			let result: unknown;

			if (input.expression !== undefined) {
				try {
					result = search(
						sourceData as Parameters<typeof search>[0],
						input.expression,
					);
				} catch (e) {
					throw new Error(
						`JMESPath error: ${e instanceof Error ? e.message : String(e)}. Fix the expression and try again.`,
					);
				}
			} else if (input.data !== undefined) {
				result = input.data;
			} else {
				throw new Error(
					"Provide either `data` or `expression` to submit a result.",
				);
			}

			// Validate against the output schema
			const validation = await safeValidateTypes({
				value: result,
				schema: outputSchema,
			});
			if (!validation.success) {
				throw new Error(
					`Result does not match the target output schema: ${validation.error.message}. Fix the data or expression and try again.`,
				);
			}

			submittedResult = validation.value;
			return { success: true };
		},
	});

	// _rawModel is guaranteed non-null: callers only invoke this function
	// when options._rawModel is truthy (checked in executeExtractData).
	const agent = new ToolLoopAgent({
		model: options._rawModel as LanguageModel,
		tools: {
			"probe-data": probeDataTool,
			"submit-result": submitResultTool,
			"give-up": giveUp.tool,
		},
		stopWhen: [
			() => submittedResult !== undefined || giveUp.getReason() !== undefined,
			stepCountIs(limits.probeMaxSteps),
		],
	});

	const schemaStr = JSON.stringify(step.params.outputFormat, null, 2);
	const prompt = `You need to extract structured data from a large dataset. The data is too large to include directly, so you have three tools:

- probe-data: Query the data with a JMESPath expression to explore its contents.
- submit-result: Submit the final extraction. Pass either \`data\` (the object directly) or \`expression\` (a JMESPath expression that evaluates to it). The result is validated against the target schema — if invalid, you'll get an error and can retry.
- give-up: Call this if you determine the requested data cannot be found or extracted.

## Data Structure Summary
\`\`\`
${structureSummary}
\`\`\`

## Target Output Schema
\`\`\`json
${schemaStr}
\`\`\`

## Instructions
1. Use probe-data with JMESPath expressions to explore and extract values you need.
2. When you have all the data, call submit-result with either the data directly or a JMESPath expression that produces it.
3. If the data you need is not present or cannot be extracted, call give-up with a reason.`;

	try {
		await agent.generate({ prompt });
	} catch (e) {
		if (e instanceof StepExecutionError) throw e;
		throw classifyLlmError(step.id, e);
	}

	if (submittedResult !== undefined) {
		return submittedResult;
	}

	if (giveUp.getReason() !== undefined) {
		throw new ExtractionError(
			step.id,
			`LLM was unable to extract the requested data: ${giveUp.getReason()}`,
			giveUp.getReason() as string,
		);
	}

	throw new OutputQualityError(
		step.id,
		"LLM_OUTPUT_PARSE_ERROR",
		"extract-data probe mode exhausted all steps without submitting a result",
		undefined,
	);
}

export function resolveExtractDataInputs(
	step: WorkflowStep & { type: "extract-data" },
	scope: Record<string, unknown>,
): unknown {
	try {
		return {
			sourceData: evaluateExpression(
				step.params.sourceData as Expression,
				scope,
				step.id,
			),
		};
	} catch {
		return undefined;
	}
}

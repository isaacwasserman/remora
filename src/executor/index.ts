import { safeValidateTypes } from "@ai-sdk/provider-utils";
import { search } from "@jmespath-community/jmespath";
import type { Agent, LanguageModel, ToolSet } from "ai";
import {
	APICallError,
	JSONParseError,
	NoContentGeneratedError,
	RetryError,
	stepCountIs,
	ToolLoopAgent,
	TypeValidationError,
} from "ai";
import { extractTemplateExpressions } from "../compiler/utils/jmespath-helpers";
import type { WorkflowDefinition, WorkflowStep } from "../types";
import type { ErrorCode } from "./errors";
import {
	ConfigurationError,
	ExpressionError,
	ExternalServiceError,
	OutputQualityError,
	StepExecutionError,
	ValidationError,
} from "./errors";

// ─── Helpers ─────────────────────────────────────────────────────

function stripCodeFence(text: string): string {
	const match = text.match(/^```(?:\w*)\s*\n?([\s\S]*?)\n?\s*```\s*$/);
	return match ? match[1] : text;
}

// ─── Types ───────────────────────────────────────────────────────

export interface ExecutionResult {
	success: boolean;
	stepOutputs: Record<string, unknown>;
	output?: unknown;
	error?: StepExecutionError;
}

export interface ExecuteWorkflowOptions {
	tools: ToolSet;
	agent?: Agent | LanguageModel;
	inputs?: Record<string, unknown>;
	maxRetries?: number;
	retryDelayMs?: number;
	onStepStart?: (stepId: string, step: WorkflowStep) => void;
	onStepComplete?: (stepId: string, output: unknown) => void;
}

function isAgent(value: Agent | LanguageModel): value is Agent {
	return typeof value === "object" && value !== null && "generate" in value;
}

// ─── Expression Evaluation ───────────────────────────────────────

type Expression =
	| { type: "literal"; value: unknown }
	| { type: "jmespath"; expression: string };

function evaluateExpression(
	expr: Expression,
	scope: Record<string, unknown>,
	stepId: string,
): unknown {
	if (expr.type === "literal") {
		return expr.value;
	}
	try {
		return search(scope as Parameters<typeof search>[0], expr.expression);
	} catch (e) {
		throw new ExpressionError(
			stepId,
			"JMESPATH_EVALUATION_ERROR",
			`JMESPath expression '${expr.expression}' failed: ${e instanceof Error ? e.message : String(e)}`,
			expr.expression,
			e,
		);
	}
}

function stringifyValue(value: unknown): string {
	if (value === null || value === undefined) return "";
	if (typeof value === "object") return JSON.stringify(value);
	return String(value);
}

function interpolateTemplate(
	template: string,
	scope: Record<string, unknown>,
	stepId: string,
): string {
	const { expressions } = extractTemplateExpressions(template);
	if (expressions.length === 0) return template;

	let result = "";
	let lastEnd = 0;
	for (const expr of expressions) {
		result += template.slice(lastEnd, expr.start);
		try {
			const value = search(
				scope as Parameters<typeof search>[0],
				expr.expression,
			);
			result += stringifyValue(value);
		} catch (e) {
			throw new ExpressionError(
				stepId,
				"TEMPLATE_INTERPOLATION_ERROR",
				`Template expression '${expr.expression}' failed: ${e instanceof Error ? e.message : String(e)}`,
				expr.expression,
				e,
			);
		}
		lastEnd = expr.end;
	}
	result += template.slice(lastEnd);
	return result;
}

// ─── LLM Error Classification ───────────────────────────────────

function classifyLlmError(stepId: string, e: unknown): StepExecutionError {
	if (APICallError.isInstance(e)) {
		const code: ErrorCode =
			e.statusCode === 429 ? "LLM_RATE_LIMITED" : "LLM_API_ERROR";
		return new ExternalServiceError(
			stepId,
			code,
			e.message,
			e,
			e.statusCode,
			e.isRetryable ?? true,
		);
	}
	if (RetryError.isInstance(e)) {
		return new ExternalServiceError(
			stepId,
			"LLM_API_ERROR",
			e.message,
			e,
			undefined,
			false,
		);
	}
	if (NoContentGeneratedError.isInstance(e)) {
		return new ExternalServiceError(
			stepId,
			"LLM_NO_CONTENT",
			e.message,
			e,
			undefined,
			true,
		);
	}
	if (TypeValidationError.isInstance(e)) {
		return new OutputQualityError(
			stepId,
			"LLM_OUTPUT_PARSE_ERROR",
			`LLM output could not be parsed: ${e.message}`,
			e.value,
			e,
		);
	}
	if (JSONParseError.isInstance(e)) {
		return new OutputQualityError(
			stepId,
			"LLM_OUTPUT_PARSE_ERROR",
			`LLM output could not be parsed: ${e.message}`,
			e.text,
			e,
		);
	}
	return new ExternalServiceError(
		stepId,
		"LLM_NETWORK_ERROR",
		e instanceof Error ? e.message : String(e),
		e,
		undefined,
		true,
	);
}

// ─── Input Validation ────────────────────────────────────────────

function validateWorkflowInputs(
	step: WorkflowStep & { type: "start" },
	inputs: Record<string, unknown>,
): void {
	const schema = step.params.inputSchema as Record<string, unknown>;
	if (!schema || typeof schema !== "object") return;

	const required = schema.required;
	if (Array.isArray(required)) {
		const missing = required.filter(
			(key: unknown) => typeof key === "string" && !(key in inputs),
		);
		if (missing.length > 0) {
			throw new ValidationError(
				step.id,
				"TOOL_INPUT_VALIDATION_FAILED",
				`Workflow input validation failed: missing required input(s): ${missing.join(", ")}`,
				inputs,
			);
		}
	}

	const properties = schema.properties;
	if (properties && typeof properties === "object") {
		for (const [key, value] of Object.entries(inputs)) {
			const propSchema = (properties as Record<string, unknown>)[key];
			if (
				propSchema &&
				typeof propSchema === "object" &&
				"type" in propSchema
			) {
				const expectedType = (propSchema as { type: string }).type;
				const actualType = typeof value;
				if (expectedType === "integer" || expectedType === "number") {
					if (actualType !== "number") {
						throw new ValidationError(
							step.id,
							"TOOL_INPUT_VALIDATION_FAILED",
							`Workflow input validation failed: input '${key}' expected type '${expectedType}' but got '${actualType}'`,
							inputs,
						);
					}
				} else if (expectedType === "array") {
					if (!Array.isArray(value)) {
						throw new ValidationError(
							step.id,
							"TOOL_INPUT_VALIDATION_FAILED",
							`Workflow input validation failed: input '${key}' expected type 'array' but got '${actualType}'`,
							inputs,
						);
					}
				} else if (actualType !== expectedType) {
					throw new ValidationError(
						step.id,
						"TOOL_INPUT_VALIDATION_FAILED",
						`Workflow input validation failed: input '${key}' expected type '${expectedType}' but got '${actualType}'`,
						inputs,
					);
				}
			}
		}
	}
}

// ─── Output Validation ──────────────────────────────────────────

function validateWorkflowOutput(
	outputSchema: Record<string, unknown>,
	output: unknown,
	endStepId: string,
): void {
	const expectedType = outputSchema.type;
	if (typeof expectedType === "string") {
		if (
			expectedType === "object" &&
			(typeof output !== "object" || output === null)
		) {
			throw new ValidationError(
				endStepId,
				"WORKFLOW_OUTPUT_VALIDATION_FAILED",
				`Workflow output validation failed: expected type 'object' but got '${output === null ? "null" : typeof output}'`,
				output,
			);
		}
		if (expectedType === "array" && !Array.isArray(output)) {
			throw new ValidationError(
				endStepId,
				"WORKFLOW_OUTPUT_VALIDATION_FAILED",
				`Workflow output validation failed: expected type 'array' but got '${typeof output}'`,
				output,
			);
		}
		if (
			(expectedType === "string" || expectedType === "boolean") &&
			typeof output !== expectedType
		) {
			throw new ValidationError(
				endStepId,
				"WORKFLOW_OUTPUT_VALIDATION_FAILED",
				`Workflow output validation failed: expected type '${expectedType}' but got '${typeof output}'`,
				output,
			);
		}
		if (
			(expectedType === "number" || expectedType === "integer") &&
			typeof output !== "number"
		) {
			throw new ValidationError(
				endStepId,
				"WORKFLOW_OUTPUT_VALIDATION_FAILED",
				`Workflow output validation failed: expected type '${expectedType}' but got '${typeof output}'`,
				output,
			);
		}
	}

	if (typeof output === "object" && output !== null && !Array.isArray(output)) {
		const required = outputSchema.required;
		if (Array.isArray(required)) {
			const missing = required.filter(
				(key: unknown) =>
					typeof key === "string" &&
					!(key in (output as Record<string, unknown>)),
			);
			if (missing.length > 0) {
				throw new ValidationError(
					endStepId,
					"WORKFLOW_OUTPUT_VALIDATION_FAILED",
					`Workflow output validation failed: missing required field(s): ${missing.join(", ")}`,
					output,
				);
			}
		}

		const properties = outputSchema.properties;
		if (properties && typeof properties === "object") {
			for (const [key, value] of Object.entries(
				output as Record<string, unknown>,
			)) {
				const propSchema = (properties as Record<string, unknown>)[key];
				if (
					propSchema &&
					typeof propSchema === "object" &&
					"type" in propSchema
				) {
					const propExpectedType = (propSchema as { type: string }).type;
					const actualType = typeof value;
					if (propExpectedType === "integer" || propExpectedType === "number") {
						if (actualType !== "number") {
							throw new ValidationError(
								endStepId,
								"WORKFLOW_OUTPUT_VALIDATION_FAILED",
								`Workflow output validation failed: field '${key}' expected type '${propExpectedType}' but got '${actualType}'`,
								output,
							);
						}
					} else if (propExpectedType === "array") {
						if (!Array.isArray(value)) {
							throw new ValidationError(
								endStepId,
								"WORKFLOW_OUTPUT_VALIDATION_FAILED",
								`Workflow output validation failed: field '${key}' expected type 'array' but got '${actualType}'`,
								output,
							);
						}
					} else if (actualType !== propExpectedType) {
						throw new ValidationError(
							endStepId,
							"WORKFLOW_OUTPUT_VALIDATION_FAILED",
							`Workflow output validation failed: field '${key}' expected type '${propExpectedType}' but got '${actualType}'`,
							output,
						);
					}
				}
			}
		}
	}
}

// ─── Step Handlers ───────────────────────────────────────────────

async function executeToolCall(
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

async function executeLlmPrompt(
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

async function executeExtractData(
	step: WorkflowStep & { type: "extract-data" },
	scope: Record<string, unknown>,
	agent: Agent,
): Promise<unknown> {
	const sourceData = evaluateExpression(
		step.params.sourceData as Expression,
		scope,
		step.id,
	);
	const sourceStr =
		typeof sourceData === "string"
			? sourceData
			: JSON.stringify(sourceData, null, 2);

	const schemaStr = JSON.stringify(step.params.outputFormat, null, 2);
	const prompt = `Extract the following structured data from the provided source data.\n\nSource data:\n${sourceStr}\n\nYou must respond with valid JSON matching this JSON Schema:\n${schemaStr}\n\nRespond ONLY with the JSON object, no other text.`;
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

async function executeSwitchCase(
	step: WorkflowStep & { type: "switch-case" },
	scope: Record<string, unknown>,
	stepIndex: Map<string, WorkflowStep>,
	stepOutputs: Record<string, unknown>,
	loopVars: Record<string, unknown>,
	options: ExecuteWorkflowOptions,
): Promise<unknown> {
	const switchValue = evaluateExpression(
		step.params.switchOn as Expression,
		scope,
		step.id,
	);

	let matchedBranchId: string | undefined;
	let defaultBranchId: string | undefined;

	for (const c of step.params.cases) {
		if (c.value.type === "default") {
			defaultBranchId = c.branchBodyStepId;
		} else {
			const caseValue = evaluateExpression(
				c.value as Expression,
				scope,
				step.id,
			);
			if (caseValue === switchValue) {
				matchedBranchId = c.branchBodyStepId;
				break;
			}
		}
	}

	const selectedBranchId = matchedBranchId ?? defaultBranchId;
	if (!selectedBranchId) {
		return undefined;
	}

	return await executeChain(
		selectedBranchId,
		stepIndex,
		stepOutputs,
		loopVars,
		options,
	);
}

async function executeForEach(
	step: WorkflowStep & { type: "for-each" },
	scope: Record<string, unknown>,
	stepIndex: Map<string, WorkflowStep>,
	stepOutputs: Record<string, unknown>,
	loopVars: Record<string, unknown>,
	options: ExecuteWorkflowOptions,
): Promise<unknown[]> {
	const target = evaluateExpression(
		step.params.target as Expression,
		scope,
		step.id,
	);

	if (!Array.isArray(target)) {
		throw new ValidationError(
			step.id,
			"FOREACH_TARGET_NOT_ARRAY",
			`for-each target must be an array, got ${typeof target}`,
			target,
		);
	}

	const results: unknown[] = [];
	for (const item of target) {
		const innerLoopVars = { ...loopVars, [step.params.itemName]: item };
		const lastOutput = await executeChain(
			step.params.loopBodyStepId,
			stepIndex,
			stepOutputs,
			innerLoopVars,
			options,
		);
		results.push(lastOutput);
	}
	return results;
}

// ─── Step Dispatch ───────────────────────────────────────────────

async function executeStep(
	step: WorkflowStep,
	scope: Record<string, unknown>,
	stepIndex: Map<string, WorkflowStep>,
	stepOutputs: Record<string, unknown>,
	loopVars: Record<string, unknown>,
	options: ExecuteWorkflowOptions,
): Promise<unknown> {
	switch (step.type) {
		case "tool-call":
			return executeToolCall(step, scope, options.tools);
		case "llm-prompt": {
			if (!options.agent)
				throw new ConfigurationError(
					step.id,
					"AGENT_NOT_PROVIDED",
					"No agent provided",
				);
			return executeLlmPrompt(step, scope, options.agent as Agent);
		}
		case "extract-data": {
			if (!options.agent)
				throw new ConfigurationError(
					step.id,
					"AGENT_NOT_PROVIDED",
					"No agent provided",
				);
			return executeExtractData(step, scope, options.agent as Agent);
		}
		case "switch-case":
			return executeSwitchCase(
				step,
				scope,
				stepIndex,
				stepOutputs,
				loopVars,
				options,
			);
		case "for-each":
			return executeForEach(
				step,
				scope,
				stepIndex,
				stepOutputs,
				loopVars,
				options,
			);
		case "start": {
			const inputs = options.inputs ?? {};
			const startStep = step as WorkflowStep & { type: "start" };
			validateWorkflowInputs(startStep, inputs);
			return inputs;
		}
		case "end": {
			const endStep = step as WorkflowStep & { type: "end" };
			if (endStep.params?.output) {
				return evaluateExpression(
					endStep.params.output as Expression,
					scope,
					step.id,
				);
			}
			return undefined;
		}
	}
}

// ─── Error Recovery ──────────────────────────────────────────────

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function retryStep(
	step: WorkflowStep,
	stepIndex: Map<string, WorkflowStep>,
	stepOutputs: Record<string, unknown>,
	loopVars: Record<string, unknown>,
	options: ExecuteWorkflowOptions,
	originalError: StepExecutionError,
): Promise<unknown> {
	const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
	const baseDelay = options.retryDelayMs ?? DEFAULT_BASE_DELAY_MS;
	const scope = { ...stepOutputs, ...loopVars };
	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		await sleep(baseDelay * 2 ** (attempt - 1));
		try {
			return await executeStep(
				step,
				scope,
				stepIndex,
				stepOutputs,
				loopVars,
				options,
			);
		} catch {
			if (attempt === maxRetries) throw originalError;
		}
	}
	throw originalError;
}

async function recoverFromError(
	error: StepExecutionError,
	step: WorkflowStep,
	stepIndex: Map<string, WorkflowStep>,
	stepOutputs: Record<string, unknown>,
	loopVars: Record<string, unknown>,
	options: ExecuteWorkflowOptions,
): Promise<unknown> {
	switch (error.code) {
		case "LLM_RATE_LIMITED":
		case "LLM_NETWORK_ERROR":
		case "LLM_NO_CONTENT":
		case "LLM_OUTPUT_PARSE_ERROR":
			return retryStep(step, stepIndex, stepOutputs, loopVars, options, error);

		case "LLM_API_ERROR":
			if (error instanceof ExternalServiceError && error.isRetryable) {
				return retryStep(
					step,
					stepIndex,
					stepOutputs,
					loopVars,
					options,
					error,
				);
			}
			throw error;

		default:
			throw error;
	}
}

// ─── Chain Execution ─────────────────────────────────────────────

async function executeChain(
	startStepId: string,
	stepIndex: Map<string, WorkflowStep>,
	stepOutputs: Record<string, unknown>,
	loopVars: Record<string, unknown>,
	options: ExecuteWorkflowOptions,
): Promise<unknown> {
	let currentStepId: string | undefined = startStepId;
	let lastOutput: unknown;

	while (currentStepId) {
		const step = stepIndex.get(currentStepId);
		if (!step) {
			// Defensive: the compiler and pre-flight checks should prevent this
			throw new Error(`Step '${currentStepId}' not found`);
		}

		options.onStepStart?.(step.id, step);

		const scope = { ...stepOutputs, ...loopVars };
		let stepOutput: unknown;

		try {
			stepOutput = await executeStep(
				step,
				scope,
				stepIndex,
				stepOutputs,
				loopVars,
				options,
			);
		} catch (e) {
			if (!(e instanceof StepExecutionError)) throw e;
			stepOutput = await recoverFromError(
				e,
				step,
				stepIndex,
				stepOutputs,
				loopVars,
				options,
			);
		}

		stepOutputs[step.id] = stepOutput;
		lastOutput = stepOutput;
		options.onStepComplete?.(step.id, stepOutput);

		currentStepId = step.nextStepId;
	}

	return lastOutput;
}

// ─── Pre-flight Validation ───────────────────────────────────────

function validateWorkflowConfig(
	workflow: WorkflowDefinition,
	options: ExecuteWorkflowOptions,
): void {
	const needsAgent = workflow.steps.some(
		(s) => s.type === "llm-prompt" || s.type === "extract-data",
	);
	if (needsAgent && !options.agent) {
		const llmStep = workflow.steps.find(
			(s) => s.type === "llm-prompt" || s.type === "extract-data",
		);
		throw new ConfigurationError(
			llmStep?.id ?? "unknown",
			"AGENT_NOT_PROVIDED",
			"Workflow contains LLM steps but no agent was provided",
		);
	}

	for (const step of workflow.steps) {
		if (step.type !== "tool-call") continue;
		const toolDef = options.tools[step.params.toolName];
		if (!toolDef) {
			throw new ConfigurationError(
				step.id,
				"TOOL_NOT_FOUND",
				`Tool '${step.params.toolName}' not found`,
			);
		}
		if (!toolDef.execute) {
			throw new ConfigurationError(
				step.id,
				"TOOL_MISSING_EXECUTE",
				`Tool '${step.params.toolName}' has no execute function`,
			);
		}
	}
}

// ─── Public API ──────────────────────────────────────────────────

export async function executeWorkflow(
	workflow: WorkflowDefinition,
	options: ExecuteWorkflowOptions,
): Promise<ExecutionResult> {
	const stepIndex = new Map<string, WorkflowStep>();
	for (const step of workflow.steps) {
		stepIndex.set(step.id, step);
	}

	const stepOutputs: Record<string, unknown> = {};

	const resolvedAgent = options.agent
		? isAgent(options.agent)
			? options.agent
			: new ToolLoopAgent({
					model: options.agent,
					stopWhen: stepCountIs(1),
				})
		: undefined;
	const resolvedOptions = { ...options, agent: resolvedAgent };

	try {
		validateWorkflowConfig(workflow, resolvedOptions);
		const chainOutput = await executeChain(
			workflow.initialStepId,
			stepIndex,
			stepOutputs,
			{},
			resolvedOptions,
		);

		if (workflow.outputSchema) {
			// Find the terminating end step for error reporting
			let endStepId = "unknown";
			for (const step of workflow.steps) {
				if (step.type === "end" && step.id in stepOutputs) {
					endStepId = step.id;
				}
			}
			validateWorkflowOutput(
				workflow.outputSchema as Record<string, unknown>,
				chainOutput,
				endStepId,
			);
		}

		return { success: true, stepOutputs, output: chainOutput };
	} catch (e) {
		const error =
			e instanceof StepExecutionError
				? e
				: new ExternalServiceError(
						"unknown",
						"TOOL_EXECUTION_FAILED",
						e instanceof Error ? e.message : String(e),
						e,
						undefined,
						false,
					);
		return {
			success: false,
			stepOutputs,
			error,
		};
	}
}

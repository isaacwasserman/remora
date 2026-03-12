import { safeValidateTypes } from "@ai-sdk/provider-utils";
import { search } from "@jmespath-community/jmespath";
import type { Agent, LanguageModel, ToolSet } from "ai";
import {
	APICallError,
	JSONParseError,
	jsonSchema,
	NoContentGeneratedError,
	RetryError,
	stepCountIs,
	ToolLoopAgent,
	TypeValidationError,
	tool,
} from "ai";
import { type as arktype } from "arktype";
import { extractTemplateExpressions } from "../compiler/utils/jmespath-helpers";
import type { WorkflowDefinition, WorkflowStep } from "../types";
import { createDefaultDurableContext, type DurableContext } from "./context";
import type { ErrorCode } from "./errors";
import {
	ConfigurationError,
	ExpressionError,
	ExternalServiceError,
	ExtractionError,
	OutputQualityError,
	StepExecutionError,
	ValidationError,
} from "./errors";
import { summarizeObjectStructure } from "./schema-inference";
import type {
	ExecutionDelta,
	ExecutionPathSegment,
	ExecutionState,
	RetryRecord,
} from "./state";
import { applyDelta, snapshotError } from "./state";

// ─── Helpers ─────────────────────────────────────────────────────

function stripCodeFence(text: string): string {
	const match = text.match(/^```(?:\w*)\s*\n?([\s\S]*?)\n?\s*```\s*$/);
	return match?.[1] ?? text;
}

// ─── Types ───────────────────────────────────────────────────────

/** The result of executing a workflow. */
export interface ExecutionResult {
	/** Whether the workflow completed without errors. */
	success: boolean;
	/** Map of step ID to that step's output value. */
	stepOutputs: Record<string, unknown>;
	/** The workflow's final output (from the `end` step's output expression), if any. */
	output?: unknown;
	/** The error that caused execution to fail, if `success` is `false`. */
	error?: StepExecutionError;
	/** The final execution state snapshot after the run completes. */
	executionState: ExecutionState;
}

export interface ExecutorLimits {
	/** Max wall-clock time from start to finish, including sleeps/waits. Default: 600_000 (10 min). */
	maxTotalMs?: number;
	/** Max active execution time (inside step() + checkFn, excluding sleeps/waits). Default: 300_000 (5 min). */
	maxActiveMs?: number;
	/** Soft cap on sleep durationMs and wait intervalMs. Clamped silently. Default: 300_000 (5 min). */
	maxSleepMs?: number;
	/** Soft cap on wait-for-condition maxAttempts. Clamped silently. Default: Infinity (unbounded). */
	maxAttempts?: number;
	/** Soft cap on backoffMultiplier upper bound. Clamped silently. Default: 2. */
	maxBackoffMultiplier?: number;
	/** Soft cap on backoffMultiplier lower bound. Clamped silently. Default: 1. */
	minBackoffMultiplier?: number;
	/** Soft cap on wait-for-condition timeoutMs. Clamped silently. Default: 600_000 (10 min). */
	maxTimeoutMs?: number;
	/** Byte threshold above which extract-data uses probe mode instead of inline data. Default: 50_000 (50KB). */
	probeThresholdBytes?: number;
	/** Maximum bytes returned per probe-data call. Default: 10_000 (10KB). */
	probeResultMaxBytes?: number;
	/** Maximum probe steps for extract-data probe mode. Default: 10. */
	probeMaxSteps?: number;
}

/** Options for {@link executeWorkflow}. */
export interface ExecuteWorkflowOptions {
	/** Tool definitions. Every tool referenced by a `tool-call` step must be present with an `execute` function. */
	tools: ToolSet;
	/** An AI SDK `Agent` or `LanguageModel` for `llm-prompt` and `extract-data` steps. Required if the workflow contains LLM steps. */
	agent?: Agent | LanguageModel;
	/** Input values passed to the workflow's `start` step. Validated against the start step's `inputSchema`. */
	inputs?: Record<string, unknown>;
	/** Maximum number of retries for recoverable errors (rate limits, network errors, parse failures). Defaults to 3. */
	maxRetries?: number;
	/** Base delay in milliseconds for exponential backoff between retries. Defaults to 1000. */
	retryDelayMs?: number;
	/** Called when a step begins execution. */
	onStepStart?: (stepId: string, step: WorkflowStep) => void;
	/** Called when a step completes successfully. */
	onStepComplete?: (stepId: string, output: unknown) => void;
	/** Called on every state transition with the full execution state and the idempotent delta that produced it. */
	onStateChange?: (state: ExecutionState, delta: ExecutionDelta) => void;
	/** Injectable durable execution context. Default: simple in-process implementation. */
	context?: DurableContext;
	/** Execution limits for sleep/wait/timeout bounds. */
	limits?: ExecutorLimits;
}

// ─── Execution Timer ─────────────────────────────────────────────

const DEFAULT_EXECUTOR_LIMITS: Required<ExecutorLimits> = {
	maxTotalMs: 600_000, // 10 minutes
	maxActiveMs: 300_000, // 5 minutes
	maxSleepMs: 300_000, // 5 minutes
	maxAttempts: Number.POSITIVE_INFINITY,
	maxBackoffMultiplier: 2,
	minBackoffMultiplier: 1,
	maxTimeoutMs: 600_000, // 10 minutes
	probeThresholdBytes: 50_000, // 50KB
	probeResultMaxBytes: 10_000, // 10KB
	probeMaxSteps: 10,
};

class ExecutionTimer {
	private readonly startTime = Date.now();
	private activeMs = 0;
	private activeStart: number | null = null;
	private readonly limits: Required<ExecutorLimits>;

	constructor(limits?: ExecutorLimits) {
		this.limits = { ...DEFAULT_EXECUTOR_LIMITS, ...limits };
	}

	get resolvedLimits(): Required<ExecutorLimits> {
		return this.limits;
	}

	/** Call before entering active work (step execution, condition check). */
	beginActive(): void {
		this.activeStart = Date.now();
	}

	/** Call after active work completes. Checks active timeout. */
	endActive(stepId: string): void {
		if (this.activeStart !== null) {
			this.activeMs += Date.now() - this.activeStart;
			this.activeStart = null;
		}
		if (this.activeMs > this.limits.maxActiveMs) {
			throw new ExternalServiceError(
				stepId,
				"EXECUTION_ACTIVE_TIMEOUT",
				`Active execution time ${this.activeMs}ms exceeded limit of ${this.limits.maxActiveMs}ms`,
				undefined,
				undefined,
				false,
			);
		}
	}

	/** Check total wall-clock timeout before starting a step. */
	checkTotal(stepId: string): void {
		const elapsed = Date.now() - this.startTime;
		if (elapsed > this.limits.maxTotalMs) {
			throw new ExternalServiceError(
				stepId,
				"EXECUTION_TOTAL_TIMEOUT",
				`Total execution time ${elapsed}ms exceeded limit of ${this.limits.maxTotalMs}ms`,
				undefined,
				undefined,
				false,
			);
		}
	}
}

function isAgent(value: Agent | LanguageModel): value is Agent {
	return typeof value === "object" && value !== null && "generate" in value;
}

// ─── Execution State Manager ─────────────────────────────────────

class ExecutionStateManager {
	private state: ExecutionState;
	private readonly onChange?: (
		state: ExecutionState,
		delta: ExecutionDelta,
	) => void;

	constructor(
		onChange?: (state: ExecutionState, delta: ExecutionDelta) => void,
	) {
		this.state = {
			runId: crypto.randomUUID(),
			status: "pending",
			startedAt: new Date().toISOString(),
			stepRecords: [],
		};
		this.onChange = onChange;
	}

	get currentState(): ExecutionState {
		return this.state;
	}

	private emit(delta: ExecutionDelta): void {
		this.state = applyDelta(this.state, delta);
		this.onChange?.(this.state, delta);
	}

	runStarted(): void {
		this.emit({
			type: "run-started",
			runId: this.state.runId,
			startedAt: this.state.startedAt,
		});
	}

	stepStarted(stepId: string, path: ExecutionPathSegment[]): void {
		this.emit({
			type: "step-started",
			stepId,
			path,
			startedAt: new Date().toISOString(),
		});
	}

	stepCompleted(
		stepId: string,
		path: ExecutionPathSegment[],
		output: unknown,
		durationMs: number,
		resolvedInputs?: unknown,
	): void {
		this.emit({
			type: "step-completed",
			stepId,
			path,
			completedAt: new Date().toISOString(),
			durationMs,
			output,
			resolvedInputs,
		});
	}

	stepFailed(
		stepId: string,
		path: ExecutionPathSegment[],
		error: StepExecutionError,
		durationMs: number,
		resolvedInputs?: unknown,
	): void {
		this.emit({
			type: "step-failed",
			stepId,
			path,
			failedAt: new Date().toISOString(),
			durationMs,
			error: snapshotError(error),
			resolvedInputs,
		});
	}

	retryAttempted(
		stepId: string,
		path: ExecutionPathSegment[],
		retry: RetryRecord,
	): void {
		this.emit({
			type: "step-retry",
			stepId,
			path,
			retry,
		});
	}

	runCompleted(output?: unknown): void {
		const startMs = new Date(this.state.startedAt).getTime();
		this.emit({
			type: "run-completed",
			runId: this.state.runId,
			completedAt: new Date().toISOString(),
			durationMs: Date.now() - startMs,
			output,
		});
	}

	runFailed(error: StepExecutionError): void {
		const startMs = new Date(this.state.startedAt).getTime();
		this.emit({
			type: "run-failed",
			runId: this.state.runId,
			failedAt: new Date().toISOString(),
			durationMs: Date.now() - startMs,
			error: snapshotError(error),
		});
	}
}

// ─── Expression Evaluation ───────────────────────────────────────

type Expression =
	| { type: "literal"; value: unknown }
	| { type: "jmespath"; expression: string }
	| { type: "template"; template: string };

function evaluateExpression(
	expr: Expression,
	scope: Record<string, unknown>,
	stepId: string,
): unknown {
	if (expr.type === "literal") {
		return expr.value;
	}
	if (expr.type === "template") {
		return interpolateTemplate(expr.template, scope, stepId);
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
	inputSchema: Record<string, unknown> | undefined,
	inputs: Record<string, unknown>,
): void {
	if (!inputSchema || typeof inputSchema !== "object") return;

	const required = inputSchema.required;
	if (Array.isArray(required)) {
		const missing = required.filter(
			(key: unknown) => typeof key === "string" && !(key in inputs),
		);
		if (missing.length > 0) {
			throw new ValidationError(
				"input",
				"TOOL_INPUT_VALIDATION_FAILED",
				`Workflow input validation failed: missing required input(s): ${missing.join(", ")}`,
				inputs,
			);
		}
	}

	const properties = inputSchema.properties;
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
							"input",
							"TOOL_INPUT_VALIDATION_FAILED",
							`Workflow input validation failed: input '${key}' expected type '${expectedType}' but got '${actualType}'`,
							inputs,
						);
					}
				} else if (expectedType === "array") {
					if (!Array.isArray(value)) {
						throw new ValidationError(
							"input",
							"TOOL_INPUT_VALIDATION_FAILED",
							`Workflow input validation failed: input '${key}' expected type 'array' but got '${actualType}'`,
							inputs,
						);
					}
				} else if (actualType !== expectedType) {
					throw new ValidationError(
						"input",
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

// ─── Internal Types ──────────────────────────────────────────────

/**
 * Internal resolved options. Extends the public `ExecuteWorkflowOptions`
 * with fields needed by the executor internals but not exposed to consumers.
 */
interface ResolvedExecuteWorkflowOptions extends ExecuteWorkflowOptions {
	/** The raw LanguageModel before wrapping in ToolLoopAgent. Needed by agent-loop steps. */
	_rawModel?: LanguageModel | null;
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

// ─── Shared Probe Tools ──────────────────────────────────────────

function createProbeDataTool(
	sourceData: unknown,
	limits: { probeResultMaxBytes: number },
) {
	return tool({
		description:
			"Query the available data using a JMESPath expression. Returns the matching subset of the data.",
		inputSchema: arktype({
			expression: [
				"string",
				"@",
				"A JMESPath expression to evaluate against the data. Examples: 'users[0]', 'users[*].name', 'metadata.total', 'users[?age > `30`].name'",
			],
		}),
		execute: async ({ expression }) => {
			try {
				const result = search(
					sourceData as Parameters<typeof search>[0],
					expression,
				);
				const resultStr =
					typeof result === "string" ? result : JSON.stringify(result, null, 2);
				if (
					new TextEncoder().encode(resultStr).byteLength >
					limits.probeResultMaxBytes
				) {
					const truncated = resultStr.slice(0, limits.probeResultMaxBytes);
					return `${truncated}\n\n[TRUNCATED - result exceeded ${limits.probeResultMaxBytes} bytes. Use a more specific JMESPath expression to narrow the result.]`;
				}
				return resultStr;
			} catch (e) {
				return `JMESPath error: ${e instanceof Error ? e.message : String(e)}. Check your expression syntax.`;
			}
		},
	});
}

function createGiveUpTool() {
	let reason: string | undefined;
	const giveUpTool = tool({
		description:
			"Call this if you determine you cannot complete the task or find/extract the requested data.",
		inputSchema: arktype({
			reason: [
				"string",
				"@",
				"Explanation of why the task cannot be completed",
			],
		}),
		execute: async ({ reason: r }) => {
			reason = r;
			return { acknowledged: true };
		},
	});
	return {
		tool: giveUpTool,
		getReason: () => reason,
	};
}

// ─── Extract Data Probe Mode ─────────────────────────────────────

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

async function executeAgentLoop(
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

async function executeSwitchCase(
	step: WorkflowStep & { type: "switch-case" },
	scope: Record<string, unknown>,
	stepIndex: Map<string, WorkflowStep>,
	stepOutputs: Record<string, unknown>,
	loopVars: Record<string, unknown>,
	options: ResolvedExecuteWorkflowOptions,
	context: DurableContext,
	stateManager?: ExecutionStateManager,
	execPath: ExecutionPathSegment[] = [],
): Promise<unknown> {
	const switchValue = evaluateExpression(
		step.params.switchOn as Expression,
		scope,
		step.id,
	);

	let matchedBranchId: string | undefined;
	let defaultBranchId: string | undefined;
	let matchedCaseIndex = -1;

	for (let i = 0; i < step.params.cases.length; i++) {
		const c = step.params.cases[i] as (typeof step.params.cases)[number];
		if (c.value.type === "default") {
			defaultBranchId = c.branchBodyStepId;
			if (matchedCaseIndex === -1) matchedCaseIndex = i;
		} else {
			const caseValue = evaluateExpression(
				c.value as Expression,
				scope,
				step.id,
			);
			if (caseValue === switchValue) {
				matchedBranchId = c.branchBodyStepId;
				matchedCaseIndex = i;
				break;
			}
		}
	}

	const selectedBranchId = matchedBranchId ?? defaultBranchId;
	if (!selectedBranchId) {
		return undefined;
	}

	const branchPath: ExecutionPathSegment[] = [
		...execPath,
		{
			type: "switch-case" as const,
			stepId: step.id,
			matchedCaseIndex,
			matchedValue: switchValue,
		},
	];

	return await executeChain(
		selectedBranchId,
		stepIndex,
		stepOutputs,
		loopVars,
		options,
		context,
		undefined,
		stateManager,
		branchPath,
	);
}

async function executeForEach(
	step: WorkflowStep & { type: "for-each" },
	scope: Record<string, unknown>,
	stepIndex: Map<string, WorkflowStep>,
	stepOutputs: Record<string, unknown>,
	loopVars: Record<string, unknown>,
	options: ResolvedExecuteWorkflowOptions,
	context: DurableContext,
	stateManager?: ExecutionStateManager,
	execPath: ExecutionPathSegment[] = [],
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
	for (let i = 0; i < target.length; i++) {
		const item = target[i];
		const iterationPath: ExecutionPathSegment[] = [
			...execPath,
			{
				type: "for-each" as const,
				stepId: step.id,
				iterationIndex: i,
				itemValue: item,
			},
		];
		const innerLoopVars = { ...loopVars, [step.params.itemName]: item };
		const lastOutput = await executeChain(
			step.params.loopBodyStepId,
			stepIndex,
			stepOutputs,
			innerLoopVars,
			options,
			context,
			undefined,
			stateManager,
			iterationPath,
		);
		results.push(lastOutput);
	}
	return results;
}

// ─── Wait / Sleep Handlers ───────────────────────────────────────

async function executeSleep(
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

async function executeWaitForCondition(
	step: WorkflowStep & { type: "wait-for-condition" },
	scope: Record<string, unknown>,
	stepIndex: Map<string, WorkflowStep>,
	stepOutputs: Record<string, unknown>,
	loopVars: Record<string, unknown>,
	options: ResolvedExecuteWorkflowOptions,
	context: DurableContext,
	timer: ExecutionTimer,
	stateManager?: ExecutionStateManager,
	execPath: ExecutionPathSegment[] = [],
): Promise<unknown> {
	const limits = timer.resolvedLimits;

	const maxAttempts = Math.min(
		step.params.maxAttempts
			? (evaluateExpression(
					step.params.maxAttempts as Expression,
					scope,
					step.id,
				) as number)
			: 10,
		limits.maxAttempts,
	);
	const intervalMs = Math.min(
		step.params.intervalMs
			? (evaluateExpression(
					step.params.intervalMs as Expression,
					scope,
					step.id,
				) as number)
			: 1000,
		limits.maxSleepMs,
	);
	const rawBackoff = step.params.backoffMultiplier
		? (evaluateExpression(
				step.params.backoffMultiplier as Expression,
				scope,
				step.id,
			) as number)
		: 1;
	const backoffMultiplier = Math.max(
		limits.minBackoffMultiplier,
		Math.min(rawBackoff, limits.maxBackoffMultiplier),
	);
	const timeoutMs = step.params.timeoutMs
		? Math.min(
				evaluateExpression(
					step.params.timeoutMs as Expression,
					scope,
					step.id,
				) as number,
				limits.maxTimeoutMs,
			)
		: undefined;

	let pollAttempt = 0;
	return context.waitForCondition(
		step.id,
		async () => {
			const pollPath: ExecutionPathSegment[] = [
				...execPath,
				{
					type: "wait-for-condition" as const,
					stepId: step.id,
					pollAttempt: pollAttempt++,
				},
			];
			timer.beginActive();
			try {
				await executeChain(
					step.params.conditionStepId,
					stepIndex,
					stepOutputs,
					loopVars,
					options,
					context,
					undefined,
					stateManager,
					pollPath,
				);
				const updatedScope = { ...stepOutputs, ...loopVars };
				return evaluateExpression(
					step.params.condition as Expression,
					updatedScope,
					step.id,
				);
			} finally {
				timer.endActive(step.id);
			}
		},
		{ maxAttempts, intervalMs, backoffMultiplier, timeoutMs },
	);
}

// ─── Resolve Step Inputs (for viewer display) ───────────────────

function resolveStepInputs(
	step: WorkflowStep,
	scope: Record<string, unknown>,
): unknown {
	switch (step.type) {
		case "tool-call": {
			const resolved: Record<string, unknown> = {};
			for (const [key, expr] of Object.entries(step.params.toolInput)) {
				try {
					resolved[key] = evaluateExpression(
						expr as Expression,
						scope,
						step.id,
					);
				} catch {
					resolved[key] = `<error resolving ${key}>`;
				}
			}
			return resolved;
		}
		case "llm-prompt": {
			try {
				return {
					prompt: interpolateTemplate(step.params.prompt, scope, step.id),
				};
			} catch {
				return { prompt: step.params.prompt };
			}
		}
		case "extract-data": {
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
		case "switch-case": {
			try {
				return {
					switchOn: evaluateExpression(
						step.params.switchOn as Expression,
						scope,
						step.id,
					),
				};
			} catch {
				return undefined;
			}
		}
		case "for-each": {
			try {
				return {
					target: evaluateExpression(
						step.params.target as Expression,
						scope,
						step.id,
					),
				};
			} catch {
				return undefined;
			}
		}
		case "agent-loop": {
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
		default:
			return undefined;
	}
}

// ─── Step Dispatch ───────────────────────────────────────────────

async function executeStep(
	step: WorkflowStep,
	scope: Record<string, unknown>,
	stepIndex: Map<string, WorkflowStep>,
	stepOutputs: Record<string, unknown>,
	loopVars: Record<string, unknown>,
	options: ResolvedExecuteWorkflowOptions,
	context: DurableContext,
	timer: ExecutionTimer,
	stateManager?: ExecutionStateManager,
	execPath: ExecutionPathSegment[] = [],
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
		case "extract-data":
			return executeExtractData(step, scope, options, timer.resolvedLimits);
		case "agent-loop":
			return executeAgentLoop(step, scope, options, timer.resolvedLimits);
		case "switch-case":
			return executeSwitchCase(
				step,
				scope,
				stepIndex,
				stepOutputs,
				loopVars,
				options,
				context,
				stateManager,
				execPath,
			);
		case "for-each":
			return executeForEach(
				step,
				scope,
				stepIndex,
				stepOutputs,
				loopVars,
				options,
				context,
				stateManager,
				execPath,
			);
		case "sleep":
			return executeSleep(step, scope, context, timer);
		case "wait-for-condition":
			return executeWaitForCondition(
				step,
				scope,
				stepIndex,
				stepOutputs,
				loopVars,
				options,
				context,
				timer,
				stateManager,
				execPath,
			);
		case "start":
			return undefined;
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

async function retryStep(
	step: WorkflowStep,
	stepIndex: Map<string, WorkflowStep>,
	stepOutputs: Record<string, unknown>,
	loopVars: Record<string, unknown>,
	options: ResolvedExecuteWorkflowOptions,
	originalError: StepExecutionError,
	context: DurableContext,
	timer: ExecutionTimer,
	stateManager?: ExecutionStateManager,
	execPath: ExecutionPathSegment[] = [],
): Promise<unknown> {
	const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
	const baseDelay = options.retryDelayMs ?? DEFAULT_BASE_DELAY_MS;
	const scope = { ...stepOutputs, ...loopVars };
	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		const retryStartedAt = new Date().toISOString();
		await context.sleep(
			`${step.id}_retry_${attempt}`,
			baseDelay * 2 ** (attempt - 1),
		);
		try {
			return await executeStep(
				step,
				scope,
				stepIndex,
				stepOutputs,
				loopVars,
				options,
				context,
				timer,
				stateManager,
				execPath,
			);
		} catch (e) {
			stateManager?.retryAttempted(step.id, execPath, {
				attempt,
				startedAt: retryStartedAt,
				failedAt: new Date().toISOString(),
				errorCode: e instanceof StepExecutionError ? e.code : "UNKNOWN",
				errorMessage: e instanceof Error ? e.message : String(e),
			});
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
	options: ResolvedExecuteWorkflowOptions,
	context: DurableContext,
	timer: ExecutionTimer,
	stateManager?: ExecutionStateManager,
	execPath: ExecutionPathSegment[] = [],
): Promise<unknown> {
	switch (error.code) {
		case "LLM_RATE_LIMITED":
		case "LLM_NETWORK_ERROR":
		case "LLM_NO_CONTENT":
		case "LLM_OUTPUT_PARSE_ERROR":
			return retryStep(
				step,
				stepIndex,
				stepOutputs,
				loopVars,
				options,
				error,
				context,
				timer,
				stateManager,
				execPath,
			);

		case "LLM_API_ERROR":
			if (error instanceof ExternalServiceError && error.isRetryable) {
				return retryStep(
					step,
					stepIndex,
					stepOutputs,
					loopVars,
					options,
					error,
					context,
					timer,
					stateManager,
					execPath,
				);
			}
			throw error;

		default:
			throw error;
	}
}

// ─── Chain Execution ─────────────────────────────────────────────

// In a durable execution environment, code outside context.step() re-runs
// on every resume. All code in this loop body outside the context.step()
// call must therefore be idempotent: pure reads (stepIndex lookups,
// nextStepId traversal), scope construction, and writing the same cached
// step output back into stepOutputs.
async function executeChain(
	startStepId: string,
	stepIndex: Map<string, WorkflowStep>,
	stepOutputs: Record<string, unknown>,
	loopVars: Record<string, unknown>,
	options: ResolvedExecuteWorkflowOptions,
	context: DurableContext,
	timer?: ExecutionTimer,
	stateManager?: ExecutionStateManager,
	execPath: ExecutionPathSegment[] = [],
): Promise<unknown> {
	let currentStepId: string | undefined = startStepId;
	let lastOutput: unknown;

	while (currentStepId) {
		const step = stepIndex.get(currentStepId);
		if (!step) {
			// Defensive: the compiler and pre-flight checks should prevent this
			throw new Error(`Step '${currentStepId}' not found`);
		}

		timer?.checkTotal(step.id);
		const stepStartTime = Date.now();
		stateManager?.stepStarted(step.id, execPath);
		options.onStepStart?.(step.id, step);

		const scope = { ...stepOutputs, ...loopVars };
		const resolvedInputs = stateManager
			? resolveStepInputs(step, scope)
			: undefined;
		let stepOutput: unknown;

		try {
			timer?.beginActive();
			try {
				stepOutput = await context.step(step.id, () =>
					executeStep(
						step,
						scope,
						stepIndex,
						stepOutputs,
						loopVars,
						options,
						context,
						timer ?? new ExecutionTimer(),
						stateManager,
						execPath,
					),
				);
			} finally {
				timer?.endActive(step.id);
			}
		} catch (e) {
			if (!(e instanceof StepExecutionError)) {
				const durationMs = Date.now() - stepStartTime;
				const wrappedError = new ExternalServiceError(
					step.id,
					"TOOL_EXECUTION_FAILED",
					e instanceof Error ? e.message : String(e),
					e,
					undefined,
					false,
				);
				stateManager?.stepFailed(
					step.id,
					execPath,
					wrappedError,
					durationMs,
					resolvedInputs,
				);
				throw e;
			}
			stepOutput = await recoverFromError(
				e,
				step,
				stepIndex,
				stepOutputs,
				loopVars,
				options,
				context,
				timer ?? new ExecutionTimer(),
				stateManager,
				execPath,
			);
		}

		const durationMs = Date.now() - stepStartTime;
		stepOutputs[step.id] = stepOutput;
		lastOutput = stepOutput;
		stateManager?.stepCompleted(
			step.id,
			execPath,
			stepOutput,
			durationMs,
			resolvedInputs,
		);
		options.onStepComplete?.(step.id, stepOutput);

		currentStepId = step.nextStepId;
	}

	return lastOutput;
}

// ─── Pre-flight Validation ───────────────────────────────────────

function validateWorkflowConfig(
	workflow: WorkflowDefinition,
	options: ResolvedExecuteWorkflowOptions,
): void {
	const needsAgent = workflow.steps.some(
		(s) =>
			s.type === "llm-prompt" ||
			s.type === "extract-data" ||
			s.type === "agent-loop",
	);
	if (needsAgent && !options.agent) {
		const llmStep = workflow.steps.find(
			(s) =>
				s.type === "llm-prompt" ||
				s.type === "extract-data" ||
				s.type === "agent-loop",
		);
		throw new ConfigurationError(
			llmStep?.id ?? "unknown",
			"AGENT_NOT_PROVIDED",
			"Workflow contains LLM/agent steps but no agent was provided",
		);
	}

	for (const step of workflow.steps) {
		if (step.type === "tool-call") {
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
		if (step.type === "agent-loop") {
			for (const toolName of step.params.tools) {
				const toolDef = options.tools[toolName];
				if (!toolDef) {
					throw new ConfigurationError(
						step.id,
						"TOOL_NOT_FOUND",
						`Tool '${toolName}' referenced in agent-loop step not found`,
					);
				}
				if (!toolDef.execute) {
					throw new ConfigurationError(
						step.id,
						"TOOL_MISSING_EXECUTE",
						`Tool '${toolName}' referenced in agent-loop step has no execute function`,
					);
				}
			}
		}
	}
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * Executes a compiled workflow by walking its step graph from `initialStepId`.
 *
 * Handles all step types (tool calls, LLM prompts, data extraction, branching,
 * loops) and supports automatic retry with exponential backoff for recoverable
 * errors (rate limits, network failures, LLM parse errors).
 *
 * @param workflow - The workflow definition to execute (should be compiled first via {@link compileWorkflow}).
 * @param options - Execution options including tools, agent, inputs, and callbacks.
 * @returns An {@link ExecutionResult} with success status, all step outputs, and the final workflow output.
 */
export async function executeWorkflow(
	workflow: WorkflowDefinition,
	options: ExecuteWorkflowOptions,
): Promise<ExecutionResult> {
	const stepIndex = new Map<string, WorkflowStep>();
	for (const step of workflow.steps) {
		stepIndex.set(step.id, step);
	}

	const stepOutputs: Record<string, unknown> = {};

	// Preserve the raw LanguageModel for agent-loop steps that need to create
	// their own ToolLoopAgent with a different tool subset and step limit.
	const rawModel =
		options.agent && !isAgent(options.agent) ? options.agent : null;

	const resolvedAgent = options.agent
		? isAgent(options.agent)
			? options.agent
			: new ToolLoopAgent({
					model: options.agent,
					stopWhen: stepCountIs(1),
				})
		: undefined;
	const resolvedOptions: ResolvedExecuteWorkflowOptions = {
		...options,
		agent: resolvedAgent,
		_rawModel: rawModel,
	};
	const resolvedContext = options.context ?? createDefaultDurableContext();
	const timer = new ExecutionTimer(options.limits);
	const stateManager = new ExecutionStateManager(options.onStateChange);
	stateManager.runStarted();

	try {
		validateWorkflowConfig(workflow, resolvedOptions);

		const inputs = options.inputs ?? {};
		validateWorkflowInputs(
			workflow.inputSchema as Record<string, unknown> | undefined,
			inputs,
		);
		stepOutputs.input = inputs;

		const chainOutput = await executeChain(
			workflow.initialStepId,
			stepIndex,
			stepOutputs,
			{},
			resolvedOptions,
			resolvedContext,
			timer,
			stateManager,
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

		stateManager.runCompleted(chainOutput);
		return {
			success: true,
			stepOutputs,
			output: chainOutput,
			executionState: stateManager.currentState,
		};
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
		stateManager.runFailed(error);
		return {
			success: false,
			stepOutputs,
			error,
			executionState: stateManager.currentState,
		};
	}
}

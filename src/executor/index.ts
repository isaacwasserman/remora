import type { WorkflowDefinition, WorkflowStep } from "../types";
import { createDefaultDurableContext, type DurableContext } from "./context";
import {
	ConfigurationError,
	ExternalServiceError,
	StepExecutionError,
	ValidationError,
} from "./errors";
import {
	type ExecuteChainFn,
	type ExecuteWorkflowOptions,
	type ExecutionResult,
	ExecutionStateManager,
	ExecutionTimer,
	type ResolvedExecuteWorkflowOptions,
} from "./executor-types";
import type { ExecutionPathSegment } from "./state";

export type {
	ExecuteWorkflowOptions,
	ExecutionResult,
	ExecutorLimits,
} from "./executor-types";

// ─── Step Imports ────────────────────────────────────────────────

import { executeAgentLoop, resolveAgentLoopInputs } from "./steps/agent-loop";
import { executeEnd } from "./steps/end";
import {
	executeExtractData,
	resolveExtractDataInputs,
} from "./steps/extract-data";
import { executeForEach, resolveForEachInputs } from "./steps/for-each";
import { executeLlmPrompt, resolveLlmPromptInputs } from "./steps/llm-prompt";
import { executeSleep } from "./steps/sleep";
import { executeStart } from "./steps/start";
import {
	executeSwitchCase,
	resolveSwitchCaseInputs,
} from "./steps/switch-case";
import { executeToolCall, resolveToolCallInputs } from "./steps/tool-call";
import { executeWaitForCondition } from "./steps/wait-for-condition";

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

// ─── Resolve Step Inputs (for viewer display) ───────────────────

function resolveStepInputs(
	step: WorkflowStep,
	scope: Record<string, unknown>,
): unknown {
	switch (step.type) {
		case "tool-call":
			return resolveToolCallInputs(step, scope);
		case "llm-prompt":
			return resolveLlmPromptInputs(step, scope);
		case "extract-data":
			return resolveExtractDataInputs(step, scope);
		case "switch-case":
			return resolveSwitchCaseInputs(step, scope);
		case "for-each":
			return resolveForEachInputs(step, scope);
		case "agent-loop":
			return resolveAgentLoopInputs(step, scope);
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
		case "llm-prompt":
			return executeLlmPrompt(step, scope, options);
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
				executeChain,
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
				executeChain,
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
				executeChain,
			);
		case "start":
			return executeStart();
		case "end":
			return executeEnd(step, scope);
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
const executeChain: ExecuteChainFn = async function executeChain(
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
};

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
	if (needsAgent && !options.model) {
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

	const resolvedOptions: ResolvedExecuteWorkflowOptions = options;
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
			[],
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

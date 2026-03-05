import { safeValidateTypes } from "@ai-sdk/provider-utils";
import { search } from "@jmespath-community/jmespath";
import type { LanguageModel, ToolSet } from "ai";
import { generateObject, jsonSchema } from "ai";
import { extractTemplateExpressions } from "../compiler/utils/jmespath-helpers";
import type { WorkflowDefinition, WorkflowStep } from "../types";

// ─── Types ───────────────────────────────────────────────────────

export interface ExecutionResult {
	success: boolean;
	stepOutputs: Record<string, unknown>;
	error?: { stepId: string; message: string; cause?: unknown };
}

export interface ExecuteWorkflowOptions {
	tools: ToolSet;
	model?: LanguageModel;
	inputs?: Record<string, unknown>;
	onStepStart?: (stepId: string, step: WorkflowStep) => void;
	onStepComplete?: (stepId: string, output: unknown) => void;
}

class StepExecutionError extends Error {
	constructor(
		public readonly stepId: string,
		message: string,
		public override readonly cause?: unknown,
	) {
		super(message);
		this.name = "StepExecutionError";
	}
}

// ─── Expression Evaluation ───────────────────────────────────────

type Expression =
	| { type: "literal"; value: unknown }
	| { type: "jmespath"; expression: string };

function evaluateExpression(
	expr: Expression,
	scope: Record<string, unknown>,
): unknown {
	if (expr.type === "literal") {
		return expr.value;
	}
	return search(scope as Parameters<typeof search>[0], expr.expression);
}

function stringifyValue(value: unknown): string {
	if (value === null || value === undefined) return "";
	if (typeof value === "object") return JSON.stringify(value);
	return String(value);
}

function interpolateTemplate(
	template: string,
	scope: Record<string, unknown>,
): string {
	const { expressions } = extractTemplateExpressions(template);
	if (expressions.length === 0) return template;

	let result = "";
	let lastEnd = 0;
	for (const expr of expressions) {
		result += template.slice(lastEnd, expr.start);
		const value = search(
			scope as Parameters<typeof search>[0],
			expr.expression,
		);
		result += stringifyValue(value);
		lastEnd = expr.end;
	}
	result += template.slice(lastEnd);
	return result;
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
			throw new StepExecutionError(
				step.id,
				`Workflow input validation failed: missing required input(s): ${missing.join(", ")}`,
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
						throw new StepExecutionError(
							step.id,
							`Workflow input validation failed: input '${key}' expected type '${expectedType}' but got '${actualType}'`,
						);
					}
				} else if (expectedType === "array") {
					if (!Array.isArray(value)) {
						throw new StepExecutionError(
							step.id,
							`Workflow input validation failed: input '${key}' expected type 'array' but got '${actualType}'`,
						);
					}
				} else if (actualType !== expectedType) {
					throw new StepExecutionError(
						step.id,
						`Workflow input validation failed: input '${key}' expected type '${expectedType}' but got '${actualType}'`,
					);
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
	const toolDef = tools[step.params.toolName];
	if (!toolDef) {
		throw new StepExecutionError(
			step.id,
			`Tool '${step.params.toolName}' not found`,
		);
	}
	if (!toolDef.execute) {
		throw new StepExecutionError(
			step.id,
			`Tool '${step.params.toolName}' has no execute function`,
		);
	}

	const resolvedInput: Record<string, unknown> = {};
	for (const [key, expr] of Object.entries(step.params.toolInput)) {
		resolvedInput[key] = evaluateExpression(expr as Expression, scope);
	}

	if (toolDef.inputSchema) {
		const validation = await safeValidateTypes({
			value: resolvedInput,
			schema: toolDef.inputSchema,
		});
		if (!validation.success) {
			throw new StepExecutionError(
				step.id,
				`Tool '${step.params.toolName}' input validation failed: ${validation.error.message}`,
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
		throw new StepExecutionError(
			step.id,
			e instanceof Error ? e.message : String(e),
			e,
		);
	}
}

async function executeLlmPrompt(
	step: WorkflowStep & { type: "llm-prompt" },
	scope: Record<string, unknown>,
	model: LanguageModel,
): Promise<unknown> {
	const interpolatedPrompt = interpolateTemplate(step.params.prompt, scope);
	const result = await generateObject({
		model,
		prompt: interpolatedPrompt,
		schema: jsonSchema(step.params.outputFormat),
	});
	return result.object;
}

async function executeExtractData(
	step: WorkflowStep & { type: "extract-data" },
	scope: Record<string, unknown>,
	model: LanguageModel,
): Promise<unknown> {
	const sourceData = evaluateExpression(
		step.params.sourceData as Expression,
		scope,
	);
	const sourceStr =
		typeof sourceData === "string"
			? sourceData
			: JSON.stringify(sourceData, null, 2);

	const result = await generateObject({
		model,
		prompt: `Extract the following structured data from the provided source data.\n\nSource data:\n${sourceStr}`,
		schema: jsonSchema(step.params.outputFormat),
	});
	return result.object;
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
	);

	let matchedBranchId: string | undefined;
	let defaultBranchId: string | undefined;

	for (const c of step.params.cases) {
		if (c.value.type === "default") {
			defaultBranchId = c.branchBodyStepId;
		} else {
			const caseValue = evaluateExpression(c.value as Expression, scope);
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
	const target = evaluateExpression(step.params.target as Expression, scope);

	if (!Array.isArray(target)) {
		throw new StepExecutionError(
			step.id,
			`for-each target must be an array, got ${typeof target}`,
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
			throw new StepExecutionError(
				currentStepId,
				`Step '${currentStepId}' not found`,
			);
		}

		options.onStepStart?.(step.id, step);

		const scope = { ...stepOutputs, ...loopVars };
		let stepOutput: unknown;

		switch (step.type) {
			case "tool-call":
				stepOutput = await executeToolCall(step, scope, options.tools);
				break;
			case "llm-prompt":
				if (!options.model) {
					throw new StepExecutionError(
						step.id,
						"llm-prompt step requires a model but none was provided",
					);
				}
				stepOutput = await executeLlmPrompt(step, scope, options.model);
				break;
			case "extract-data":
				if (!options.model) {
					throw new StepExecutionError(
						step.id,
						"extract-data step requires a model but none was provided",
					);
				}
				stepOutput = await executeExtractData(step, scope, options.model);
				break;
			case "switch-case":
				stepOutput = await executeSwitchCase(
					step,
					scope,
					stepIndex,
					stepOutputs,
					loopVars,
					options,
				);
				break;
			case "for-each":
				stepOutput = await executeForEach(
					step,
					scope,
					stepIndex,
					stepOutputs,
					loopVars,
					options,
				);
				break;
			case "start": {
				const inputs = options.inputs ?? {};
				const startStep = step as WorkflowStep & { type: "start" };
				validateWorkflowInputs(startStep, inputs);
				stepOutput = inputs;
				break;
			}
			case "end":
				stepOutput = undefined;
				break;
		}

		stepOutputs[step.id] = stepOutput;
		lastOutput = stepOutput;
		options.onStepComplete?.(step.id, stepOutput);

		currentStepId = step.nextStepId;
	}

	return lastOutput;
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

	try {
		await executeChain(
			workflow.initialStepId,
			stepIndex,
			stepOutputs,
			{},
			options,
		);
		return { success: true, stepOutputs };
	} catch (e) {
		if (e instanceof StepExecutionError) {
			return {
				success: false,
				stepOutputs,
				error: { stepId: e.stepId, message: e.message, cause: e.cause },
			};
		}
		return {
			success: false,
			stepOutputs,
			error: {
				stepId: "unknown",
				message: e instanceof Error ? e.message : String(e),
				cause: e,
			},
		};
	}
}

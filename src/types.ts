import { type } from "arktype";

const expressionSchema = type({
	type: "'literal'",
	value: "unknown",
})
	.or({
		type: "'jmespath'",
		expression: "string",
	})
	.describe(
		"a value that must always be wrapped as an expression object — use { type: 'literal', value: ... } for any static value (strings, numbers, booleans, etc.), or { type: 'jmespath', expression: '...' } for dynamic data extracted from previous steps' outputs (via their step ids, e.g. `stepId.someKey`) or loop variables (e.g. `itemName.someKey` within a for-each loop body)",
	);

const toolCallParamsSchema = type({
	type: "'tool-call'",
	params: {
		toolName: "string",
		toolInput: [
			{
				"[string]": expressionSchema,
			},
			"@",
			"a map of input parameter names to their values; ALL values must be wrapped as expression objects — even static strings like email addresses must use { type: 'literal', value: '...' }, never plain primitives",
		],
	},
}).describe(
	"a step that calls a tool with specified input parameters (which can be static values or expressions)",
);

const switchCaseParamsSchema = type({
	type: "'switch-case'",
	params: {
		switchOn: expressionSchema,
		cases: [
			{
				value: expressionSchema.or({ type: "'default'" }),
				branchBodyStepId: [
					"string",
					"@",
					"the id of the first step in the branch body chain to execute if this case matches",
				],
			},
			"[]",
		],
	},
}).describe(
	"a step that branches to different step chains based on the value of an expression; each case's chain runs until a step with no nextStepId, at which point execution continues with this step's nextStepId; a case with type 'default' serves as the fallback if no other case matches",
);

const forEachParamsSchema = type({
	type: "'for-each'",
	params: {
		target: expressionSchema,
		itemName: [
			"string",
			"@",
			"the name to refer to the current item in the list within expressions in the loop body",
		],
		loopBodyStepId: [
			"string",
			"@",
			"the id of the first step in the loop body chain to execute for each item in the list",
		],
	},
}).describe(
	"a step that iterates over a list and executes a chain of steps for each item; the loop body chain runs until a step with no nextStepId, at which point the next iteration begins; once all items are exhausted, execution continues with this step's nextStepId",
);

const llmPromptSchema = type({
	type: "'llm-prompt'",
	params: {
		prompt: [
			"string",
			"@",
			"a template string where JMESPath expressions can be embedded using ${...} syntax (e.g. 'Hello ${user.name}, you have ${length(user.messages)} messages'). All data from previous steps is available via their step ids (e.g. ${stepId.someKey}), and loop variables are available within for-each loop bodies (e.g. ${itemName.someKey})",
		],
		outputFormat: [
			"object",
			"@",
			"JSON schema specifying the output format expected from the LLM",
		],
	},
}).describe(
	"a step that prompts an LLM with a text prompt to produce an output in a specified format",
);

const extractDataParamsSchema = type({
	type: "'extract-data'",
	params: {
		sourceData: [expressionSchema, "@", "the data to extract information from"],
		outputFormat: [
			"object",
			"@",
			"JSON schema specifying the output format expected from the data extraction",
		],
	},
}).describe(
	"a step that uses an LLM to extract structured data from a larger blob of source data (e.g. llm responses or tool outputs with unknown output formats) based on a specified output format",
);

const sleepParamsSchema = type({
	type: "'sleep'",
	params: {
		durationMs: expressionSchema,
	},
}).describe(
	"a step that pauses workflow execution for a specified duration in milliseconds; the durationMs parameter must evaluate to a non-negative number",
);

const waitForConditionParamsSchema = type({
	type: "'wait-for-condition'",
	params: {
		conditionStepId: [
			"string",
			"@",
			"the id of the first step in the condition-check chain that will be executed on each polling attempt; this chain runs until a step with no nextStepId, then the condition expression is evaluated",
		],
		condition: [
			expressionSchema,
			"@",
			"an expression evaluated after each execution of the condition-check chain; if it evaluates to a truthy value, the wait completes with that value as its output; all step outputs from the condition chain are available in scope for this expression",
		],
		"maxAttempts?": [
			expressionSchema,
			"@",
			"maximum number of polling attempts before giving up (default: 10)",
		],
		"intervalMs?": [
			expressionSchema,
			"@",
			"milliseconds to wait between polling attempts (default: 1000)",
		],
		"backoffMultiplier?": [
			expressionSchema,
			"@",
			"multiply the interval by this factor after each attempt (default: 1, i.e. no backoff; use 2 for exponential backoff)",
		],
		"timeoutMs?": [
			expressionSchema,
			"@",
			"hard timeout in milliseconds; if the total elapsed time exceeds this, the step fails regardless of remaining attempts",
		],
	},
}).describe(
	"a step that repeatedly executes a condition-check chain (starting at conditionStepId) and then evaluates the condition expression against the updated scope; if the condition expression evaluates to a truthy value, the step completes with that value as its output; otherwise it waits for intervalMs milliseconds (multiplied by backoffMultiplier after each attempt) and tries again, up to maxAttempts times or until timeoutMs milliseconds have elapsed; the condition-check chain runs until a step with no nextStepId, at which point the condition expression is evaluated; all step outputs from the condition chain are available in scope for the condition expression",
);

const startParamsSchema = type({
	type: "'start'",
}).describe(
	"a step that marks the entry point of a workflow; a no-op marker whose execution continues to the next step",
);

const endSchema = type({
	type: "'end'",
	"params?": {
		output: expressionSchema,
	},
}).describe(
	"a step that indicates the end of a branch; optionally specify an output expression whose evaluated value becomes the workflow's output",
);

const workflowStepSchema = type({
	id: /^[a-zA-Z_][a-zA-Z0-9_]+$/,
	name: "string",
	description: "string",
	"nextStepId?": "string",
}).and(
	toolCallParamsSchema
		.or(llmPromptSchema)
		.or(extractDataParamsSchema)
		.or(switchCaseParamsSchema)
		.or(forEachParamsSchema)
		.or(sleepParamsSchema)
		.or(waitForConditionParamsSchema)
		.or(startParamsSchema)
		.or(endSchema),
);

/**
 * ArkType schema for validating workflow definitions. Use this to validate
 * workflow JSON before passing it to {@link compileWorkflow}.
 */
export const workflowDefinitionSchema = type({
	initialStepId: "string",
	"inputSchema?": [
		"object",
		"@",
		"an optional JSON Schema object defining the inputs required to run the workflow; the executor validates provided inputs against this schema, and the validated inputs become available in JMESPath scope via the root identifier 'input' (e.g. input.fieldName)",
	],
	"outputSchema?": [
		"object",
		"@",
		"an optional JSON Schema object declaring the shape of the workflow's output; when present, the value produced by the end step's output expression will be validated against this schema",
	],
	steps: [
		[workflowStepSchema, "[]"],
		"@",
		"a list of steps to execute in the workflow; these should be in no particular order as execution flow is determined by the nextStepId fields and branching logic within the steps",
	],
});

/**
 * A single step in a workflow. Each step has a type that determines its behavior:
 * - `start` — entry point, declares input schema
 * - `tool-call` — calls a tool with literal or expression-based arguments
 * - `llm-prompt` — prompts an LLM with template string interpolation
 * - `extract-data` — uses an LLM to extract structured data from unstructured source
 * - `switch-case` — branches to different step chains based on an expression value
 * - `for-each` — iterates over an array, executing a chain of steps per item
 * - `end` — terminates a branch, optionally producing workflow output
 */
export type WorkflowStep = typeof workflowStepSchema.infer;

/**
 * A complete workflow definition. Contains an initial step ID and an ordered list of steps.
 * Execution flow is determined by each step's `nextStepId` and branching/looping logic,
 * not by the order of steps in the array.
 */
export type WorkflowDefinition = typeof workflowDefinitionSchema.infer;

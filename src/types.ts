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
			// biome-ignore lint/suspicious/noTemplateCurlyInString: This is a demonstration for how to use template strings
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

const endSchema = type({
	type: "'end'",
}).describe("a step that indicates the end of a branch");

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
		.or(endSchema),
);

export const workflowDefinitionSchema = type({
	initialStepId: "string",
	steps: [
		[workflowStepSchema, "[]"],
		"@",
		"a list of steps to execute in the workflow; these should be in no particular order as execution flow is determined by the nextStepId fields and branching logic within the steps",
	],
});

export type WorkflowStep = typeof workflowStepSchema.infer;
export type WorkflowDefinition = typeof workflowDefinitionSchema.infer;

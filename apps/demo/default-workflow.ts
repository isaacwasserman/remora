import type { WorkflowDefinition } from "@remoraflow/core";

export const DEFAULT_WORKFLOW: WorkflowDefinition = {
	initialStepId: "start",
	steps: [
		{
			id: "start",
			name: "Start",
			description: "Begin the workflow",
			type: "start",
			nextStepId: "generate_data",
			params: {},
		},
		{
			id: "generate_data",
			name: "Generate Cities",
			description: "Generate a list of city names to process",
			type: "tool-call",
			nextStepId: "process_each",
			params: {
				toolName: "generate-list",
				toolInput: {
					category: { type: "literal", value: "cities" },
					count: { type: "literal", value: 5 },
				},
			},
		},
		{
			id: "process_each",
			name: "Process Each City",
			description: "Iterate over each city and fetch weather data",
			type: "for-each",
			nextStepId: "done",
			params: {
				target: { type: "jmespath", expression: "generate_data.items" },
				itemName: "city",
				loopBodyStepId: "get_weather",
			},
		},
		{
			id: "get_weather",
			name: "Get Weather",
			description: "Fetch mock weather data for the current city",
			type: "tool-call",
			params: {
				toolName: "fetch-mock-api",
				toolInput: {
					endpoint: { type: "literal", value: "weather" },
					id: { type: "jmespath", expression: "city" },
				},
			},
		},
		{
			id: "done",
			name: "Done",
			description: "End of workflow with collected results",
			type: "end",
			params: {
				output: { type: "jmespath", expression: "process_each" },
			},
		},
	],
};

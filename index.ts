import { createOpenAI } from "@ai-sdk/openai";
import { Output, type ToolSet, asSchema, generateText, jsonSchema, tool } from "ai";
import { type Type, type } from "arktype";
import { workflowDefinitionSchema, type WorkflowDefinition } from "./types";
import { workflowToMermaid } from "./diagram";
import fs from "node:fs/promises";
import { EXAMPLE_TASKS } from "./example-tasks";
import { compileWorkflow } from "./compiler";

const openrouter = createOpenAI({
	baseURL: "https://openrouter.ai/api/v1",
	apiKey: process.env.OPENROUTER_API_KEY,
});

const model = openrouter("anthropic/claude-haiku-4.5");

async function serializeToolsForPrompt(tools: ToolSet) {
	return JSON.stringify(
		await Promise.all(
			Object.entries(tools).map(async ([toolName, toolDef]) => ({
				name: toolName,
				description: toolDef.description,
				inputSchema: await asSchema(toolDef.inputSchema).jsonSchema,
				outputSchema: toolDef.outputSchema ? await asSchema(toolDef.outputSchema).jsonSchema : "output schema not provided",
			}))
		)
	);
}

async function generateWorkflow({
	availableTools,
	task,
}: {
	availableTools: ToolSet;
	task: string;
}) {
	const result = await generateText({
		model,
		tools: {
			createWorkflow: tool({
				description: `Create a workflow based on a definition provided in the input. Here are the available tools to use within the workflow: ${await serializeToolsForPrompt(availableTools)}`,
				inputSchema: workflowDefinitionSchema,
				execute: async (workflowDefinition) => {
					compileWorkflow(workflowDefinition, { tools: availableTools });
				},
			}),
		},
		prompt: `Create a workflow to accomplish the following task:\n\n${task}`,
		toolChoice: {
			type: "tool",
			toolName: "createWorkflow",
		},
	});
	// biome-ignore lint/style/noNonNullAssertion: <explanation>
	const workflowDefinition = result.toolCalls[0]!.input as WorkflowDefinition;
	return workflowDefinition;
}

async function main() {
	for (const [taskName, { availableTools, task }] of Object.entries(
		EXAMPLE_TASKS,
	)) {
		const workflowDefinition = await generateWorkflow({
			availableTools,
			task,
		});

		await fs.writeFile(
			`${taskName}-workflow.json`,
			JSON.stringify(workflowDefinition, null, 2),
		);

		const mermaidDiagram = workflowToMermaid(workflowDefinition);
		await fs.writeFile(
			`${taskName}-workflow-diagram.md`,
			`\`\`\`mermaid\n${mermaidDiagram}\n\`\`\``,
		);
	}
}

await main();

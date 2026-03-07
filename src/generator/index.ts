import type { LanguageModel, ToolSet } from "ai";
import { generateText, stepCountIs, tool } from "ai";
import { type as arktype } from "arktype";
import { compileWorkflow } from "../compiler";
import type { Diagnostic } from "../compiler/types";
import type { WorkflowDefinition } from "../types";
import { workflowDefinitionSchema } from "../types";
import {
	buildWorkflowGenerationPrompt,
	formatDiagnostics,
	serializeToolsForPrompt,
} from "./prompt";

// ─── Types ───────────────────────────────────────────────────────

export interface GenerateWorkflowOptions {
	model: LanguageModel;
	tools: ToolSet;
	task: string;
	maxRetries?: number;
}

export interface GenerateWorkflowResult {
	workflow: WorkflowDefinition | null;
	diagnostics: Diagnostic[];
	attempts: number;
}

export interface WorkflowGeneratorToolOptions {
	model: LanguageModel;
	tools?: ToolSet;
	maxRetries?: number;
}

// ─── generateWorkflow ────────────────────────────────────────────

export async function generateWorkflow(
	options: GenerateWorkflowOptions,
): Promise<GenerateWorkflowResult> {
	const { model, tools, task, maxRetries = 3 } = options;

	const serializedTools = await serializeToolsForPrompt(tools);
	const systemPrompt = buildWorkflowGenerationPrompt(serializedTools);

	let successWorkflow: WorkflowDefinition | null = null;
	let lastDiagnostics: Diagnostic[] = [];
	let attempts = 0;

	const createWorkflowTool = tool({
		description: "Create a workflow definition",
		inputSchema: workflowDefinitionSchema,
		execute: async (workflowDef) => {
			attempts++;
			const result = await compileWorkflow(workflowDef, { tools });
			lastDiagnostics = result.diagnostics;

			const errors = result.diagnostics.filter((d) => d.severity === "error");
			if (errors.length > 0) {
				return {
					success: false,
					errors: formatDiagnostics(result.diagnostics),
				};
			}

			successWorkflow = result.workflow ?? workflowDef;
			return { success: true };
		},
	});

	await generateText({
		model,
		system: systemPrompt,
		prompt: `Create a workflow to accomplish the following task:\n\n${task}`,
		tools: { createWorkflow: createWorkflowTool },
		toolChoice: { type: "tool", toolName: "createWorkflow" },
		stopWhen: [stepCountIs(maxRetries + 1), () => successWorkflow !== null],
	});

	return {
		workflow: successWorkflow,
		diagnostics: lastDiagnostics,
		attempts,
	};
}

// ─── createWorkflowGeneratorTool ─────────────────────────────────

export function createWorkflowGeneratorTool(
	options: WorkflowGeneratorToolOptions,
) {
	const { model, tools: baseTools, maxRetries } = options;

	return tool({
		description:
			"Generate a validated workflow definition from a natural language task description",
		inputSchema: arktype({ task: "string" }),
		execute: async ({ task }) => {
			return generateWorkflow({
				model,
				tools: baseTools ?? {},
				task,
				maxRetries,
			});
		},
	});
}

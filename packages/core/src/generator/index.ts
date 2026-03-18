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

/** Options for {@link generateWorkflow}. */
export interface GenerateWorkflowOptions {
  /** The language model to use for generating the workflow. */
  model: LanguageModel;
  /** Available tools the generated workflow can reference. All tools must have an `outputSchema`. */
  tools: ToolSet;
  /** Natural language description of the task the workflow should accomplish. */
  task: string;
  /** Maximum number of generation attempts if the LLM produces invalid workflows. Defaults to 3. */
  maxRetries?: number;
  /** Additional instructions appended to the system prompt to guide workflow generation. */
  additionalInstructions?: string;
}

/** The result of generating a workflow via LLM. */
export interface GenerateWorkflowResult {
  /** The generated workflow, or `null` if all attempts produced invalid workflows. */
  workflow: WorkflowDefinition | null;
  /** Diagnostics from the last compilation attempt. */
  diagnostics: Diagnostic[];
  /** Total number of generation attempts made. */
  attempts: number;
}

/** Options for {@link createWorkflowGeneratorTool}. */
export interface WorkflowGeneratorToolOptions {
  /** The language model to use for generation. */
  model: LanguageModel;
  /** Available tools the generated workflow can reference. */
  tools?: ToolSet;
  /** Maximum number of generation attempts. Defaults to 3. */
  maxRetries?: number;
  /** Additional instructions appended to the system prompt to guide workflow generation. */
  additionalInstructions?: string;
}

// ─── generateWorkflow ────────────────────────────────────────────

/**
 * Uses an LLM to generate a validated workflow definition from a natural language
 * task description. The LLM produces a workflow via tool call, which is then compiled
 * and validated. If compilation fails, diagnostics are fed back to the LLM for
 * correction, up to `maxRetries` attempts.
 *
 * @param options - Generation options including model, tools, and task description.
 * @returns A {@link GenerateWorkflowResult} with the generated workflow (or null), diagnostics, and attempt count.
 * @throws If any tool in `options.tools` is missing an `outputSchema`.
 */
export async function generateWorkflow(
  options: GenerateWorkflowOptions,
): Promise<GenerateWorkflowResult> {
  const {
    model,
    tools,
    task,
    maxRetries = 3,
    additionalInstructions,
  } = options;

  const missingOutputSchema = Object.entries(tools)
    .filter(([_, t]) => !t.outputSchema)
    .map(([name]) => name);
  if (missingOutputSchema.length > 0) {
    throw new Error(
      `All tools must have an outputSchema. Missing: ${missingOutputSchema.join(", ")}`,
    );
  }

  const serializedTools = await serializeToolsForPrompt(tools);
  const systemPrompt = buildWorkflowGenerationPrompt(
    serializedTools,
    additionalInstructions,
  );

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

/**
 * Creates an AI SDK tool that generates validated workflow definitions from
 * natural language task descriptions. Useful for giving an agent the ability
 * to create workflows on the fly.
 *
 * @param options - Configuration including the model and available tools.
 * @returns An AI SDK `tool` that accepts a `{ task: string }` input and returns a {@link GenerateWorkflowResult}.
 */
export function createWorkflowGeneratorTool(
  options: WorkflowGeneratorToolOptions,
) {
  const {
    model,
    tools: baseTools,
    maxRetries,
    additionalInstructions,
  } = options;

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
        additionalInstructions,
      });
    },
  });
}

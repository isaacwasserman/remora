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

// ─── Failure Codes ───────────────────────────────────────────────

/**
 * arktype schema for the codes the agent can return via the `giveUp` tool.
 * The string union below is the source of truth for {@link WorkflowGiveUpCode}
 * and {@link WORKFLOW_GIVE_UP_CODES}; keep all three in sync if you add or
 * rename a code.
 */
const giveUpCodeSchema = arktype(
  "'missing-capability' | 'ambiguous-task' | 'not-workflow-shaped' | 'infeasible' | 'unsafe' | 'other'",
);

/**
 * A code returned by the agent via the `giveUp` tool to categorize why it
 * could not produce a workflow.
 *
 * - `missing-capability`: no available tool can perform a required action.
 * - `ambiguous-task`: the task is too ambiguous or under-specified to express as a deterministic workflow.
 * - `not-workflow-shaped`: the request is not a workflow-shaped task (e.g. a factual question).
 * - `infeasible`: the task is logically impossible or self-contradictory with the available tools.
 * - `unsafe`: the agent refuses on safety grounds.
 * - `other`: none of the above; see the free-form `failureMessage` for details.
 */
export type WorkflowGiveUpCode = typeof giveUpCodeSchema.infer;

/** The list of all {@link WorkflowGiveUpCode} values, in declaration order. */
export const WORKFLOW_GIVE_UP_CODES: readonly WorkflowGiveUpCode[] = [
  "missing-capability",
  "ambiguous-task",
  "not-workflow-shaped",
  "infeasible",
  "unsafe",
  "other",
];

/**
 * A code reported on {@link GenerateWorkflowResult.failureCode} when
 * `success` is `false`. Includes every {@link WorkflowGiveUpCode} the agent
 * may emit, plus `"compile-errors-exhausted"`, which is set automatically
 * when the retry budget is spent on compile errors rather than by the agent
 * calling `giveUp`.
 */
export type WorkflowFailureCode =
  | WorkflowGiveUpCode
  | "compile-errors-exhausted";

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
  /** Whether a valid workflow was produced. When `true`, `workflow` is non-null and `failureCode`/`failureMessage` are `undefined`. */
  success: boolean;
  /** The generated workflow, or `null` if generation failed. */
  workflow: WorkflowDefinition | null;
  /** Diagnostics from the last compilation attempt. */
  diagnostics: Diagnostic[];
  /** Total number of `createWorkflow` attempts made. Does not count a `giveUp` call. */
  attempts: number;
  /** When `success` is `false`, the categorical reason generation failed. `undefined` on success. */
  failureCode?: WorkflowFailureCode;
  /** When `success` is `false`, a free-form explanation (from the agent's `giveUp` reason or from compile diagnostics). `undefined` on success. */
  failureMessage?: string;
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
  let gaveUp = false;
  let failureCode: WorkflowFailureCode | undefined;
  let failureMessage: string | undefined;

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

  const giveUpTool = tool({
    description:
      "Signal that you cannot produce a valid workflow for the given task. " +
      "Call this only when the task is fundamentally impossible with the available tools, " +
      "is unacceptably ambiguous, or otherwise cannot be expressed as a deterministic workflow — " +
      "NOT simply because an earlier createWorkflow attempt failed to compile. " +
      "If you encounter compile errors, prefer fixing them and retrying createWorkflow. " +
      "You must provide both a categorical `code` and a free-form `reason` explaining the decision.",
    inputSchema: arktype({
      code: giveUpCodeSchema,
      reason: "string>0",
    }),
    execute: async ({ code, reason }) => {
      gaveUp = true;
      failureCode = code;
      failureMessage = reason;
      return { acknowledged: true };
    },
  });

  await generateText({
    model,
    system: systemPrompt,
    prompt: `Create a workflow to accomplish the following task:\n\n${task}`,
    tools: { createWorkflow: createWorkflowTool, giveUp: giveUpTool },
    toolChoice: "required",
    stopWhen: [
      stepCountIs(maxRetries + 1),
      () => successWorkflow !== null,
      () => gaveUp,
    ],
  });

  const success = successWorkflow !== null;
  if (!success && !gaveUp) {
    // Retries exhausted on compile errors without an explicit give-up.
    failureCode = "compile-errors-exhausted";
    failureMessage = formatDiagnostics(lastDiagnostics);
  }

  return {
    success,
    workflow: successWorkflow,
    diagnostics: lastDiagnostics,
    attempts,
    failureCode,
    failureMessage,
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

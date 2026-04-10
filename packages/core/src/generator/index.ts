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
 * The list of all {@link WorkflowGiveUpCode} values, in declaration order.
 * This is the single source of truth for the give-up code set: both
 * {@link WorkflowGiveUpCode} and the internal `giveUpCodeSchema` arktype are
 * derived from this array.
 */
export const WORKFLOW_GIVE_UP_CODES = [
  "missing-capability",
  "ambiguous-task",
  "not-workflow-shaped",
  "infeasible",
  "unsafe",
  "other",
] as const;

/**
 * A code returned by the agent via the `giveUp` tool to categorize why it
 * could not produce a workflow. See
 * {@link WORKFLOW_GIVE_UP_CODE_DESCRIPTIONS} for the per-code explanation
 * that the LLM sees via the tool's JSON Schema.
 */
export type WorkflowGiveUpCode = (typeof WORKFLOW_GIVE_UP_CODES)[number];

/**
 * Per-variant descriptions attached to each code in `giveUpCodeSchema`.
 * These propagate into the tool's JSON Schema via arktype's `.describe()`,
 * so the LLM sees an inline explanation of each code without needing the
 * list to be enumerated in the system prompt.
 */
const WORKFLOW_GIVE_UP_CODE_DESCRIPTIONS: Record<WorkflowGiveUpCode, string> = {
  "missing-capability":
    "a required action has no matching tool in the available tool set",
  "ambiguous-task":
    "the task is too ambiguous or under-specified to express as a deterministic workflow",
  "not-workflow-shaped":
    "the request is not a workflow-shaped task (e.g. a factual question, a one-off computation, or pure conversation)",
  infeasible:
    "the task is logically impossible or self-contradictory given the available tools",
  unsafe:
    "the task asks you to do something you should refuse on safety grounds",
  other: "none of the above apply; the free-form reason must explain",
};

/**
 * arktype schema for the `code` field of the `giveUp` tool. Built by folding
 * each {@link WORKFLOW_GIVE_UP_CODES} entry into a described literal, so the
 * JSON Schema shown to the LLM carries a per-variant description inline.
 */
const describedCodeVariant = (code: WorkflowGiveUpCode) =>
  arktype(`'${code}'`).describe(WORKFLOW_GIVE_UP_CODE_DESCRIPTIONS[code]);
const [firstGiveUpCode, ...restGiveUpCodes] = WORKFLOW_GIVE_UP_CODES;
const giveUpCodeSchema = restGiveUpCodes.reduce(
  (acc, code) => acc.or(describedCodeVariant(code)),
  describedCodeVariant(firstGiveUpCode),
);

/**
 * A code reported on {@link GenerateWorkflowResult.failureCode} when
 * `success` is `false`. Includes every {@link WorkflowGiveUpCode} the agent
 * may emit, plus `"retries-exhausted"`, which is set automatically when the
 * retry budget is spent on compile errors rather than by the agent calling
 * `giveUp`.
 */
export type WorkflowFailureCode = WorkflowGiveUpCode | "retries-exhausted";

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

/** The result of a successful {@link generateWorkflow} call. */
export interface GenerateWorkflowSuccess {
  /** Discriminant — `true` when the workflow was successfully generated. */
  success: true;
  /** The validated workflow definition (possibly optimized by the compiler). */
  workflow: WorkflowDefinition;
  /** Diagnostics from the final (successful) compilation attempt. */
  diagnostics: Diagnostic[];
  /** Total number of `createWorkflow` attempts made. */
  attempts: number;
  /** Always `undefined` on success. Declared here so the field is accessible on the broad union type. */
  failureCode?: undefined;
  /** Always `undefined` on success. Declared here so the field is accessible on the broad union type. */
  failureMessage?: undefined;
}

/** The result of a failed {@link generateWorkflow} call. */
export interface GenerateWorkflowFailure {
  /** Discriminant — `false` when generation failed. */
  success: false;
  /** Always `null` on failure. */
  workflow: null;
  /** Diagnostics from the last (failed) compilation attempt, or `[]` if the agent gave up before attempting. */
  diagnostics: Diagnostic[];
  /** Total number of `createWorkflow` attempts made before failure. `0` if the agent gave up immediately. */
  attempts: number;
  /** The categorical reason generation failed. */
  failureCode: WorkflowFailureCode;
  /** A free-form explanation — from the agent's `giveUp` reason or from formatted compile diagnostics. */
  failureMessage: string;
}

/**
 * The result of generating a workflow via LLM. This is a discriminated union
 * on the `success` field: when `success` is `true`, `workflow` is guaranteed
 * non-null and `failureCode`/`failureMessage` are `undefined`; when `success`
 * is `false`, `workflow` is `null` and both failure fields are populated.
 */
export type GenerateWorkflowResult =
  | GenerateWorkflowSuccess
  | GenerateWorkflowFailure;

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

  type ExitState =
    | { kind: "pending" }
    | { kind: "success"; workflow: WorkflowDefinition }
    | { kind: "give-up"; code: WorkflowGiveUpCode; reason: string };

  let exitState: ExitState = { kind: "pending" };
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

      exitState = {
        kind: "success",
        workflow: result.workflow ?? workflowDef,
      };
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
      exitState = { kind: "give-up", code, reason };
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
      () => exitState.kind === "success",
      () => exitState.kind === "give-up",
    ],
  });

  // Widen back to the full ExitState before switching. Stock `tsc` otherwise
  // keeps `exitState` narrowed to its initializer `{ kind: "pending" }` after
  // the await — it can't prove the tool-execute closures (which reassign it)
  // actually ran, so the narrowing from the `let` initializer sticks.
  const finalState = exitState as ExitState;
  switch (finalState.kind) {
    case "success":
      return {
        success: true,
        workflow: finalState.workflow,
        diagnostics: lastDiagnostics,
        attempts,
      };
    case "give-up":
      return {
        success: false,
        workflow: null,
        diagnostics: lastDiagnostics,
        attempts,
        failureCode: finalState.code,
        failureMessage: finalState.reason,
      };
    case "pending":
      // Retries exhausted on compile errors without an explicit give-up.
      return {
        success: false,
        workflow: null,
        diagnostics: lastDiagnostics,
        attempts,
        failureCode: "retries-exhausted",
        failureMessage: formatDiagnostics(lastDiagnostics),
      };
  }
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

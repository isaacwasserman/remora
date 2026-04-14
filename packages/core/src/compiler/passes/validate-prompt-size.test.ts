import { describe, expect, test } from "bun:test";
import { MAXIMUM_PROMPT_LENGTH } from "../../prompt-size";
import type { WorkflowDefinition } from "../../types";
import { compileWorkflow } from "../index";

// ─── Helpers ─────────────────────────────────────────────────────

/** Generate a string of approximately N tokens. */
function generateTokens(n: number): string {
  const words: string[] = [];
  for (let i = 0; i < n; i++) {
    words.push(`word${i}`);
  }
  return words.join(" ");
}

function makeWorkflowWithPrompt(prompt: string): WorkflowDefinition {
  return {
    initialStepId: "start",
    steps: [
      {
        id: "start",
        name: "Start",
        description: "Entry",
        type: "start",
        nextStepId: "prompt_step",
      },
      {
        id: "prompt_step",
        name: "Prompt",
        description: "LLM prompt step",
        type: "llm-prompt",
        params: {
          prompt,
          outputFormat: {
            type: "object",
            properties: { result: { type: "string" } },
            required: ["result"],
          },
        },
        nextStepId: "done",
      },
      {
        id: "done",
        name: "Done",
        description: "End",
        type: "end",
      },
    ],
  } as WorkflowDefinition;
}

function makeWorkflowWithAgentLoop(instructions: string): WorkflowDefinition {
  return {
    initialStepId: "start",
    steps: [
      {
        id: "start",
        name: "Start",
        description: "Entry",
        type: "start",
        nextStepId: "agent_step",
      },
      {
        id: "agent_step",
        name: "Agent",
        description: "Agent loop step",
        type: "agent-loop",
        params: {
          instructions,
          tools: [],
          outputFormat: {
            type: "object",
            properties: { result: { type: "string" } },
            required: ["result"],
          },
        },
        nextStepId: "done",
      },
      {
        id: "done",
        name: "Done",
        description: "End",
        type: "end",
      },
    ],
  } as WorkflowDefinition;
}

// ─── Tests ───────────────────────────────────────────────────────

describe("validate-prompt-size", () => {
  test("passes for short prompt templates", async () => {
    const workflow = makeWorkflowWithPrompt(
      "Classify this ticket: ${data.subject}",
    );
    const result = await compileWorkflow(workflow);
    const promptSizeDiags = result.diagnostics.filter(
      (d) => d.code === "PROMPT_TEMPLATE_EXCEEDS_TOKEN_LIMIT",
    );
    expect(promptSizeDiags).toHaveLength(0);
  });

  test("emits error when llm-prompt template exceeds default limit", async () => {
    const hugePrompt = generateTokens(MAXIMUM_PROMPT_LENGTH + 1000);
    const workflow = makeWorkflowWithPrompt(hugePrompt);
    const result = await compileWorkflow(workflow);
    const promptSizeDiags = result.diagnostics.filter(
      (d) => d.code === "PROMPT_TEMPLATE_EXCEEDS_TOKEN_LIMIT",
    );
    expect(promptSizeDiags).toHaveLength(1);
    expect(promptSizeDiags[0].severity).toBe("error");
    expect(promptSizeDiags[0].location.stepId).toBe("prompt_step");
    expect(promptSizeDiags[0].location.field).toBe("params.prompt");
  });

  test("emits error when agent-loop instructions exceed default limit", async () => {
    const hugeInstructions = generateTokens(MAXIMUM_PROMPT_LENGTH + 1000);
    const workflow = makeWorkflowWithAgentLoop(hugeInstructions);
    const result = await compileWorkflow(workflow);
    const promptSizeDiags = result.diagnostics.filter(
      (d) => d.code === "PROMPT_TEMPLATE_EXCEEDS_TOKEN_LIMIT",
    );
    expect(promptSizeDiags).toHaveLength(1);
    expect(promptSizeDiags[0].severity).toBe("error");
    expect(promptSizeDiags[0].location.stepId).toBe("agent_step");
    expect(promptSizeDiags[0].location.field).toBe("params.instructions");
  });

  test("respects custom maxPromptTokens limit", async () => {
    const prompt = generateTokens(200);
    const workflow = makeWorkflowWithPrompt(prompt);

    // Should pass with default limit
    const resultDefault = await compileWorkflow(workflow);
    expect(
      resultDefault.diagnostics.filter(
        (d) => d.code === "PROMPT_TEMPLATE_EXCEEDS_TOKEN_LIMIT",
      ),
    ).toHaveLength(0);

    // Should fail with a very low custom limit
    const resultCustom = await compileWorkflow(workflow, {
      limits: { maxPromptTokens: 50 },
    });
    const diags = resultCustom.diagnostics.filter(
      (d) => d.code === "PROMPT_TEMPLATE_EXCEEDS_TOKEN_LIMIT",
    );
    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain("50 tokens");
  });

  test("checks all prompt steps in a workflow", async () => {
    const hugePrompt = generateTokens(200);
    const workflow: WorkflowDefinition = {
      initialStepId: "start",
      steps: [
        {
          id: "start",
          name: "Start",
          description: "Entry",
          type: "start",
          nextStepId: "prompt_one",
        },
        {
          id: "prompt_one",
          name: "Prompt 1",
          description: "First prompt",
          type: "llm-prompt",
          params: {
            prompt: hugePrompt,
            outputFormat: {
              type: "object",
              properties: { r: { type: "string" } },
              required: ["r"],
            },
          },
          nextStepId: "prompt_two",
        },
        {
          id: "prompt_two",
          name: "Prompt 2",
          description: "Second prompt",
          type: "llm-prompt",
          params: {
            prompt: hugePrompt,
            outputFormat: {
              type: "object",
              properties: { r: { type: "string" } },
              required: ["r"],
            },
          },
          nextStepId: "done",
        },
        {
          id: "done",
          name: "Done",
          description: "End",
          type: "end",
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow, {
      limits: { maxPromptTokens: 50 },
    });
    const diags = result.diagnostics.filter(
      (d) => d.code === "PROMPT_TEMPLATE_EXCEEDS_TOKEN_LIMIT",
    );
    expect(diags).toHaveLength(2);
    expect(diags[0].location.stepId).toBe("prompt_one");
    expect(diags[1].location.stepId).toBe("prompt_two");
  });
});

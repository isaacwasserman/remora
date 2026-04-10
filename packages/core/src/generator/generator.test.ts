import { describe, expect, test } from "bun:test";
import type { LanguageModelV3GenerateResult } from "@ai-sdk/provider";
import { tool } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { type } from "arktype";
import type { WorkflowDefinition } from "../types";
import {
  createWorkflowGeneratorTool,
  generateWorkflow,
  WORKFLOW_GIVE_UP_CODES,
  type WorkflowGiveUpCode,
} from ".";
import {
  buildWorkflowGenerationPrompt,
  serializeToolsForPrompt,
} from "./prompt";

// ─── Test Tools ──────────────────────────────────────────────────

const testTools = {
  echo: tool({
    description: "Echoes back the input",
    inputSchema: type({}),
    outputSchema: type({ echoed: "boolean" }),
    execute: async () => ({ echoed: true }),
  }),
  greet: tool({
    description: "Greets someone by name",
    inputSchema: type({ name: "string" }),
    outputSchema: type({ greeting: "string" }),
    execute: async ({ name }) => ({ greeting: `Hello, ${name}!` }),
  }),
};

// ─── Valid Workflow Fixtures ─────────────────────────────────────

const validWorkflow: WorkflowDefinition = {
  initialStepId: "call_echo",
  steps: [
    {
      id: "call_echo",
      name: "Call echo",
      description: "Calls the echo tool",
      type: "tool-call",
      params: {
        toolName: "echo",
        toolInput: {},
      },
    },
  ],
};

const invalidWorkflow: WorkflowDefinition = {
  initialStepId: "call_missing",
  steps: [
    {
      id: "call_missing",
      name: "Call missing tool",
      description: "Calls a tool that does not exist",
      type: "tool-call",
      params: {
        toolName: "nonexistent_tool",
        toolInput: {},
      },
    },
  ],
};

// ─── Mock Model Helper ──────────────────────────────────────────

type MockToolCall =
  | { toolName: "createWorkflow"; input: WorkflowDefinition }
  | {
      toolName: "giveUp";
      input: { code: WorkflowGiveUpCode; reason: string };
    };

function mockResult(
  call: MockToolCall,
  index: number,
): LanguageModelV3GenerateResult {
  return {
    content: [
      {
        type: "tool-call",
        toolCallId: `call_${index}`,
        toolName: call.toolName,
        input: JSON.stringify(call.input),
      },
    ],
    finishReason: { unified: "tool-calls", raw: undefined },
    usage: {
      inputTokens: {
        total: 10,
        noCache: undefined,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: {
        total: 10,
        text: undefined,
        reasoning: undefined,
      },
    },
    warnings: [],
  } as LanguageModelV3GenerateResult;
}

function createMockModel(workflows: WorkflowDefinition[]) {
  let callIndex = 0;
  return new MockLanguageModelV3({
    doGenerate: async () => {
      const i = callIndex++;
      const workflow = workflows[i] ?? workflows[workflows.length - 1];
      return mockResult({ toolName: "createWorkflow", input: workflow }, i);
    },
  });
}

function createMockModelWithCalls(calls: MockToolCall[]) {
  let callIndex = 0;
  return new MockLanguageModelV3({
    doGenerate: async () => {
      const i = callIndex++;
      const call = calls[i] ?? calls[calls.length - 1];
      return mockResult(call, i);
    },
  });
}

// ─── generateWorkflow ────────────────────────────────────────────

describe("generateWorkflow", () => {
  test("happy path: valid workflow on first attempt", async () => {
    const model = createMockModel([validWorkflow]);

    const result = await generateWorkflow({
      model,
      tools: testTools,
      task: "Call the echo tool",
    });

    expect(result.success).toBe(true);
    expect(result.workflow).not.toBeNull();
    expect(result.attempts).toBe(1);
    expect(result.failureCode).toBeUndefined();
    expect(result.failureMessage).toBeUndefined();
    expect(
      result.diagnostics.filter((d) => d.severity === "error"),
    ).toHaveLength(0);
  });

  test("retry: invalid workflow then valid workflow", async () => {
    const model = createMockModel([invalidWorkflow, validWorkflow]);

    const result = await generateWorkflow({
      model,
      tools: testTools,
      task: "Call the echo tool",
    });

    expect(result.success).toBe(true);
    expect(result.workflow).not.toBeNull();
    expect(result.attempts).toBe(2);
    expect(result.failureCode).toBeUndefined();
    expect(
      result.diagnostics.filter((d) => d.severity === "error"),
    ).toHaveLength(0);
  });

  test("exhaustion: all attempts produce invalid workflows", async () => {
    const model = createMockModel([invalidWorkflow]);

    const result = await generateWorkflow({
      model,
      tools: testTools,
      task: "Call the echo tool",
      maxRetries: 2,
    });

    expect(result.success).toBe(false);
    expect(result.workflow).toBeNull();
    expect(result.attempts).toBe(3); // 1 initial + 2 retries
    expect(result.failureCode).toBe("compile-errors-exhausted");
    expect(result.failureMessage).toBeDefined();
    expect(result.failureMessage?.length ?? 0).toBeGreaterThan(0);
    expect(
      result.diagnostics.filter((d) => d.severity === "error").length,
    ).toBeGreaterThan(0);
  });

  test("rejects tools without outputSchema", async () => {
    const toolsWithoutOutput = {
      broken: tool({
        description: "No output schema",
        inputSchema: type({}),
        execute: async () => ({}),
      }),
    };

    await expect(
      generateWorkflow({
        model: createMockModel([validWorkflow]),
        tools: toolsWithoutOutput,
        task: "Do something",
      }),
    ).rejects.toThrow("outputSchema");
  });

  test("maxRetries: 0 means single attempt only", async () => {
    const model = createMockModel([invalidWorkflow]);

    const result = await generateWorkflow({
      model,
      tools: testTools,
      task: "Call the echo tool",
      maxRetries: 0,
    });

    expect(result.success).toBe(false);
    expect(result.attempts).toBe(1);
    expect(result.workflow).toBeNull();
    expect(result.failureCode).toBe("compile-errors-exhausted");
  });

  test("giveUp: agent gives up immediately with missing-capability", async () => {
    const model = createMockModelWithCalls([
      {
        toolName: "giveUp",
        input: {
          code: "missing-capability",
          reason: "No tool can send emails, which this task requires.",
        },
      },
    ]);

    const result = await generateWorkflow({
      model,
      tools: testTools,
      task: "Send an email to bob@example.com",
    });

    expect(result.success).toBe(false);
    expect(result.workflow).toBeNull();
    expect(result.failureCode).toBe("missing-capability");
    expect(result.failureMessage).toBe(
      "No tool can send emails, which this task requires.",
    );
    expect(result.attempts).toBe(0);
    expect(result.diagnostics).toEqual([]);
  });

  test("giveUp: agent retries createWorkflow then gives up", async () => {
    const model = createMockModelWithCalls([
      { toolName: "createWorkflow", input: invalidWorkflow },
      {
        toolName: "giveUp",
        input: { code: "infeasible", reason: "Required tool is missing." },
      },
    ]);

    const result = await generateWorkflow({
      model,
      tools: testTools,
      task: "Do the impossible",
      maxRetries: 3,
    });

    expect(result.success).toBe(false);
    expect(result.workflow).toBeNull();
    expect(result.failureCode).toBe("infeasible");
    expect(result.failureMessage).toBe("Required tool is missing.");
    expect(result.attempts).toBe(1);
    // diagnostics from the last failed createWorkflow attempt are preserved
    expect(
      result.diagnostics.filter((d) => d.severity === "error").length,
    ).toBeGreaterThan(0);
  });

  test("giveUp: each code is accepted by the giveUp tool", async () => {
    for (const code of WORKFLOW_GIVE_UP_CODES) {
      const model = createMockModelWithCalls([
        {
          toolName: "giveUp",
          input: { code, reason: `giving up with code ${code}` },
        },
      ]);

      const result = await generateWorkflow({
        model,
        tools: testTools,
        task: "Some task",
      });

      expect(result.success).toBe(false);
      expect(result.failureCode).toBe(code);
      expect(result.failureMessage).toBe(`giving up with code ${code}`);
    }
  });

  test("giveUp: failure fields are undefined on success", async () => {
    const model = createMockModel([validWorkflow]);

    const result = await generateWorkflow({
      model,
      tools: testTools,
      task: "Call the echo tool",
    });

    expect(result.success).toBe(true);
    expect(result.workflow).not.toBeNull();
    expect(result.failureCode).toBeUndefined();
    expect(result.failureMessage).toBeUndefined();
  });

  test("giveUp: retries exhausted uses compile-errors-exhausted code", async () => {
    const model = createMockModel([invalidWorkflow]);

    const result = await generateWorkflow({
      model,
      tools: testTools,
      task: "Call the echo tool",
      maxRetries: 1,
    });

    expect(result.success).toBe(false);
    expect(result.workflow).toBeNull();
    expect(result.failureCode).toBe("compile-errors-exhausted");
    expect(result.failureMessage).toBeDefined();
  });

  test("returns optimized workflow from compiler", async () => {
    // The compiler adds __start and __end steps via best practices
    const model = createMockModel([validWorkflow]);

    const result = await generateWorkflow({
      model,
      tools: testTools,
      task: "Call the echo tool",
    });

    expect(result.workflow).not.toBeNull();
    // The compiler's applyBestPractices adds start/end steps
    const stepIds = result.workflow?.steps.map((s) => s.id);
    expect(stepIds).toContain("call_echo");
  });
});

// ─── createWorkflowGeneratorTool ─────────────────────────────────

describe("createWorkflowGeneratorTool", () => {
  test("returns a tool that calls generateWorkflow", async () => {
    const model = createMockModel([validWorkflow]);

    const genTool = createWorkflowGeneratorTool({
      model,
      tools: testTools,
    });

    expect(genTool.inputSchema).toBeDefined();
    expect(genTool.execute).toBeDefined();

    const result = (await genTool.execute?.(
      { task: "Call the echo tool" },
      {} as never,
    )) as Awaited<ReturnType<typeof generateWorkflow>>;

    expect(result.workflow).not.toBeNull();
    expect(result.attempts).toBe(1);
  });
});

// ─── Prompt utilities ────────────────────────────────────────────

describe("serializeToolsForPrompt", () => {
  test("serializes tool names, descriptions, and schemas", async () => {
    const serialized = await serializeToolsForPrompt(testTools);
    const parsed = JSON.parse(serialized);

    expect(parsed).toHaveLength(2);

    const echo = parsed.find((t: { name: string }) => t.name === "echo");
    expect(echo).toBeDefined();
    expect(echo.description).toBe("Echoes back the input");
    expect(echo.inputSchema).toBeDefined();

    const greet = parsed.find((t: { name: string }) => t.name === "greet");
    expect(greet).toBeDefined();
    expect(greet.description).toBe("Greets someone by name");
  });
});

describe("buildWorkflowGenerationPrompt", () => {
  test("includes DSL reference sections", () => {
    const prompt = buildWorkflowGenerationPrompt("[]");

    expect(prompt).toContain("tool-call");
    expect(prompt).toContain("llm-prompt");
    expect(prompt).toContain("extract-data");
    expect(prompt).toContain("switch-case");
    expect(prompt).toContain("for-each");
    expect(prompt).toContain("start");
    expect(prompt).toContain("end");
    expect(prompt).toContain("jmespath");
    expect(prompt).toContain("literal");
    expect(prompt).toContain("nextStepId");
  });

  test("includes serialized tools", () => {
    const tools = '[{"name":"myTool","description":"does things"}]';
    const prompt = buildWorkflowGenerationPrompt(tools);

    expect(prompt).toContain("myTool");
    expect(prompt).toContain("does things");
  });

  test("appends additional instructions when provided", () => {
    const prompt = buildWorkflowGenerationPrompt(
      "[]",
      "Always use the greet tool before the echo tool.",
    );

    expect(prompt).toContain("## Additional Instructions");
    expect(prompt).toContain("Always use the greet tool before the echo tool.");
  });

  test("omits additional instructions section when not provided", () => {
    const prompt = buildWorkflowGenerationPrompt("[]");

    expect(prompt).not.toContain("## Additional Instructions");
  });

  test("mentions the giveUp escape hatch and every code", () => {
    const prompt = buildWorkflowGenerationPrompt("[]");

    expect(prompt).toContain("giveUp");
    expect(prompt).toContain("reason");
    expect(prompt).toContain("code");
    for (const code of WORKFLOW_GIVE_UP_CODES) {
      expect(prompt).toContain(code);
    }
  });
});

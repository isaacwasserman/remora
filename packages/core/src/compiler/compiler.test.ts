import { describe, expect, test } from "bun:test";
import { tool } from "ai";
import { type } from "arktype";
import { EXAMPLE_TASKS } from "../example-tasks";
import type { WorkflowDefinition } from "../types";
import type { Diagnostic, DiagnosticCode } from ".";
import { compileWorkflow } from ".";

// ─── Helpers ─────────────────────────────────────────────────────

function hasDiagnostic(
  diagnostics: Diagnostic[],
  code: DiagnosticCode,
): boolean {
  return diagnostics.some((d) => d.code === code);
}

function getDiagnostics(
  diagnostics: Diagnostic[],
  code: DiagnosticCode,
): Diagnostic[] {
  return diagnostics.filter((d) => d.code === code);
}

function getFirstDiagnostic(
  diagnostics: Diagnostic[],
  code: DiagnosticCode,
): Diagnostic {
  const diag = diagnostics.find((d) => d.code === code);
  if (!diag)
    throw new Error(
      `Expected diagnostic with code '${code}' but none was found`,
    );
  return diag;
}

function errors(diagnostics: Diagnostic[]): Diagnostic[] {
  return diagnostics.filter((d) => d.severity === "error");
}

function _warnings(diagnostics: Diagnostic[]): Diagnostic[] {
  return diagnostics.filter((d) => d.severity === "warning");
}

// ─── Minimal valid workflow factory ──────────────────────────────

function makeWorkflow(
  overrides?: Partial<WorkflowDefinition>,
): WorkflowDefinition {
  return {
    initialStepId: "start",
    steps: [
      {
        id: "start",
        name: "Start",
        description: "First step",
        type: "tool-call",
        params: {
          toolName: "do-thing",
          toolInput: {},
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
    ...overrides,
  } as WorkflowDefinition;
}

// ─── Tool definitions for testing ────────────────────────────────

const testTools = {
  "do-thing": tool({
    inputSchema: type({}),
    execute: async () => ({}),
  }),
  "get-open-tickets": tool({
    inputSchema: type({}),
    execute: async () => ({}),
  }),
  "page-on-call-engineer": tool({
    inputSchema: type({
      ticketId: "string",
      reason: "string",
    }),
    execute: async () => ({}),
  }),
  "send-slack-message": tool({
    inputSchema: type({
      channel: "string",
      message: "string",
    }),
    execute: async () => ({}),
  }),
};

// ─── Workflow fixtures ──────────────────────────────────────────

const ticketReviewWorkflow = {
  initialStepId: "get_tickets",
  steps: [
    {
      id: "get_tickets",
      name: "Get Open Tickets",
      description: "Fetch all open support tickets",
      type: "tool-call",
      params: {
        toolName: "get-open-tickets",
        toolInput: {},
      },
      nextStepId: "review_tickets",
    },
    {
      id: "review_tickets",
      name: "Review Each Ticket",
      description: "Iterate over each ticket for classification",
      type: "for-each",
      params: {
        target: { type: "jmespath", expression: "get_tickets.tickets" },
        itemName: "ticket",
        loopBodyStepId: "classify_ticket",
      },
      nextStepId: "send_summary",
    },
    {
      id: "classify_ticket",
      name: "Classify Ticket",
      description: "Use LLM to classify ticket as critical or routine",
      type: "llm-prompt",
      params: {
        prompt:
          "Classify this support ticket as critical or routine.\n\nSubject: ${ticket.subject}\nBody: ${ticket.body}",
        outputFormat: {
          type: "object",
          properties: {
            classification: {
              type: "string",
              enum: ["critical", "routine"],
            },
            reason: { type: "string" },
          },
          required: ["classification", "reason"],
        },
      },
      nextStepId: "check_classification",
    },
    {
      id: "check_classification",
      name: "Check Classification",
      description: "Branch based on ticket classification",
      type: "switch-case",
      params: {
        switchOn: {
          type: "jmespath",
          expression: "classify_ticket.classification",
        },
        cases: [
          {
            value: { type: "literal", value: "critical" },
            branchBodyStepId: "page_engineer",
          },
          {
            value: { type: "default" },
            branchBodyStepId: "routine_noop",
          },
        ],
      },
    },
    {
      id: "page_engineer",
      name: "Page On-Call Engineer",
      description: "Page the on-call engineer for critical tickets",
      type: "tool-call",
      params: {
        toolName: "page-on-call-engineer",
        toolInput: {
          ticketId: { type: "jmespath", expression: "ticket.id" },
          reason: {
            type: "jmespath",
            expression: "classify_ticket.reason",
          },
        },
      },
    },
    {
      id: "routine_noop",
      name: "Routine No-Op",
      description: "No action needed for routine tickets",
      type: "end",
    },
    {
      id: "send_summary",
      name: "Send Summary",
      description: "Send a Slack summary after processing all tickets",
      type: "tool-call",
      params: {
        toolName: "send-slack-message",
        toolInput: {
          channel: {
            type: "literal",
            value: "support-standup",
          },
          message: {
            type: "literal",
            value: "Daily ticket review complete",
          },
        },
      },
      nextStepId: "done",
    },
    {
      id: "done",
      name: "Done",
      description: "End of workflow",
      type: "end",
    },
  ],
};

const headlinesWorkflow = {
  initialStepId: "get-headlines",
  steps: [
    {
      id: "get-headlines",
      name: "Get Headlines",
      description: "Fetch today's headlines",
      type: "tool-call",
      params: {
        toolName: "get-headlines",
        toolInput: {},
      },
      nextStepId: "check-headline-count",
    },
    {
      id: "check-headline-count",
      name: "Check Headline Count",
      description: "Branch based on number of headlines",
      type: "switch-case",
      params: {
        switchOn: { type: "literal", value: true },
        cases: [
          {
            value: { type: "literal", value: true },
            branchBodyStepId: "send-individual-emails",
          },
          {
            value: { type: "default" },
            branchBodyStepId: "send-busy-news-email",
          },
        ],
      },
      nextStepId: "end-workflow",
    },
    {
      id: "send-individual-emails",
      name: "Send Individual Emails",
      description: "Send an email for each headline",
      type: "for-each",
      params: {
        target: { type: "literal", value: [] },
        itemName: "headline",
        loopBodyStepId: "send-headline-email",
      },
    },
    {
      id: "send-headline-email",
      name: "Send Headline Email",
      description: "Send email for one headline",
      type: "tool-call",
      params: {
        toolName: "send-email",
        toolInput: {},
      },
    },
    {
      id: "send-busy-news-email",
      name: "Send Busy News Email",
      description: "Send a summary email when there are many headlines",
      type: "tool-call",
      params: {
        toolName: "send-email",
        toolInput: {},
      },
    },
    {
      id: "end-workflow",
      name: "End",
      description: "End of workflow",
      type: "end",
    },
  ],
};

// ─── Integration: Real workflows ─────────────────────────────────

describe("integration: real workflow files", () => {
  test("ticket-review workflow compiles with zero errors", async () => {
    const result = await compileWorkflow(
      ticketReviewWorkflow as WorkflowDefinition,
      { tools: testTools },
    );
    const errs = errors(result.diagnostics);
    if (errs.length > 0) {
      console.log("Unexpected errors:", errs);
    }
    expect(errs).toHaveLength(0);
    expect(result.graph).not.toBeNull();
  });

  test("headlines workflow produces INVALID_STEP_ID for hyphenated IDs", async () => {
    const result = await compileWorkflow(
      headlinesWorkflow as WorkflowDefinition,
    );
    // This workflow uses kebab-case step IDs (get-headlines, send-individual-emails, etc.)
    // which are now invalid — step IDs must be valid JMESPath bare identifiers
    expect(hasDiagnostic(result.diagnostics, "INVALID_STEP_ID")).toBe(true);
    const invalidIds = getDiagnostics(result.diagnostics, "INVALID_STEP_ID");
    // All hyphenated step IDs should be flagged
    const flaggedIds = invalidIds.map((d) => d.location.stepId);
    expect(flaggedIds).toContain("get-headlines");
    expect(flaggedIds).toContain("send-individual-emails");
    expect(flaggedIds).toContain("send-headline-email");
    expect(flaggedIds).toContain("check-headline-count");
    expect(flaggedIds).toContain("send-busy-news-email");
    expect(flaggedIds).toContain("end-workflow");
  });

  test("ticket-review workflow without tool definitions still validates structure", async () => {
    const result = await compileWorkflow(
      ticketReviewWorkflow as WorkflowDefinition,
    );
    // No UNKNOWN_TOOL errors since tools aren't provided
    expect(hasDiagnostic(result.diagnostics, "UNKNOWN_TOOL")).toBe(false);
    expect(result.graph).not.toBeNull();
  });

  test("ticket-review workflow validates with real AI SDK tool definitions from example-tasks", async () => {
    const result = await compileWorkflow(
      ticketReviewWorkflow as WorkflowDefinition,
      { tools: EXAMPLE_TASKS["ticket-review"].availableTools },
    );
    const errs = errors(result.diagnostics);
    if (errs.length > 0) {
      console.log("Unexpected errors:", errs);
    }
    expect(errs).toHaveLength(0);
    expect(result.graph).not.toBeNull();
  });

  test("order-fulfillment workflow compiles with zero errors", async () => {
    const task = EXAMPLE_TASKS["order-fulfillment"];
    const result = await compileWorkflow(task.workflow as WorkflowDefinition, {
      tools: task.availableTools,
    });
    const errs = errors(result.diagnostics);
    if (errs.length > 0) {
      console.log("Unexpected errors:", errs);
    }
    expect(errs).toHaveLength(0);
    expect(
      result.diagnostics.filter(
        (d) => d.severity === "warning" && d.code !== "MISSING_START_STEP",
      ),
    ).toHaveLength(0);
    expect(result.graph).not.toBeNull();
  });

  test("content-moderation workflow compiles with zero errors", async () => {
    const task = EXAMPLE_TASKS["content-moderation"];
    const result = await compileWorkflow(task.workflow as WorkflowDefinition, {
      tools: task.availableTools,
    });
    const errs = errors(result.diagnostics);
    if (errs.length > 0) {
      console.log("Unexpected errors:", errs);
    }
    expect(errs).toHaveLength(0);
    expect(
      result.diagnostics.filter(
        (d) => d.severity === "warning" && d.code !== "MISSING_START_STEP",
      ),
    ).toHaveLength(0);
    expect(result.graph).not.toBeNull();
  });

  test("course-assignment workflow compiles with zero errors", async () => {
    const task = EXAMPLE_TASKS["course-assignment"];
    const result = await compileWorkflow(task.workflow as WorkflowDefinition, {
      tools: task.availableTools,
    });
    const errs = errors(result.diagnostics);
    if (errs.length > 0) {
      console.log("Unexpected errors:", errs);
    }
    expect(errs).toHaveLength(0);
    expect(
      result.diagnostics.filter(
        (d) => d.severity === "warning" && d.code !== "MISSING_START_STEP",
      ),
    ).toHaveLength(0);
    expect(result.graph).not.toBeNull();
  });
});

// ─── Valid workflows ─────────────────────────────────────────────

describe("valid workflows", () => {
  test("minimal workflow: tool-call → end", async () => {
    const result = await compileWorkflow(makeWorkflow());
    expect(errors(result.diagnostics)).toHaveLength(0);
    expect(result.graph).not.toBeNull();
  });

  test("workflow with only an end step as initial step", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "done",
      steps: [
        {
          id: "done",
          name: "Done",
          description: "Only step",
          type: "end",
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow);
    expect(errors(result.diagnostics)).toHaveLength(0);
  });

  test("workflow with for-each and loop variable references", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "get_data",
      steps: [
        {
          id: "get_data",
          name: "Get Data",
          description: "Fetch data",
          type: "tool-call",
          params: {
            toolName: "get-items",
            toolInput: {},
          },
          nextStepId: "loop",
        },
        {
          id: "loop",
          name: "Loop",
          description: "Iterate items",
          type: "for-each",
          params: {
            target: { type: "jmespath", expression: "get_data.items" },
            itemName: "item",
            loopBodyStepId: "process_item",
          },
          nextStepId: "done",
        },
        {
          id: "process_item",
          name: "Process Item",
          description: "Handle each item",
          type: "tool-call",
          params: {
            toolName: "handle-item",
            toolInput: {
              name: { type: "jmespath", expression: "item.name" },
            },
          },
        },
        {
          id: "done",
          name: "Done",
          description: "End",
          type: "end",
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow);
    expect(errors(result.diagnostics)).toHaveLength(0);
  });
});

// ─── Step reference validation ───────────────────────────────────

describe("step reference validation", () => {
  test("missing initialStepId", async () => {
    const workflow = makeWorkflow({ initialStepId: "nonexistent" });
    const result = await compileWorkflow(workflow);
    expect(hasDiagnostic(result.diagnostics, "MISSING_INITIAL_STEP")).toBe(
      true,
    );
  });

  test("missing nextStepId reference", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "start",
      steps: [
        {
          id: "start",
          name: "Start",
          description: "First step",
          type: "tool-call",
          params: { toolName: "do-thing", toolInput: {} },
          nextStepId: "ghost",
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow);
    expect(hasDiagnostic(result.diagnostics, "MISSING_NEXT_STEP")).toBe(true);
    const diag = getFirstDiagnostic(result.diagnostics, "MISSING_NEXT_STEP");
    expect(diag.location.stepId).toBe("start");
    expect(diag.message).toContain("ghost");
  });

  test("missing branchBodyStepId reference", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "sw",
      steps: [
        {
          id: "sw",
          name: "Switch",
          description: "Branch",
          type: "switch-case",
          params: {
            switchOn: { type: "literal", value: true },
            cases: [
              {
                value: { type: "literal", value: true },
                branchBodyStepId: "nonexistent_branch",
              },
            ],
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

    const result = await compileWorkflow(workflow);
    expect(hasDiagnostic(result.diagnostics, "MISSING_BRANCH_BODY_STEP")).toBe(
      true,
    );
  });

  test("missing loopBodyStepId reference", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "loop",
      steps: [
        {
          id: "loop",
          name: "Loop",
          description: "Iterate",
          type: "for-each",
          params: {
            target: { type: "literal", value: [1, 2] },
            itemName: "x",
            loopBodyStepId: "ghost_body",
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

    const result = await compileWorkflow(workflow);
    expect(hasDiagnostic(result.diagnostics, "MISSING_LOOP_BODY_STEP")).toBe(
      true,
    );
  });

  test("duplicate step IDs", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "a",
      steps: [
        {
          id: "a",
          name: "A1",
          description: "First",
          type: "tool-call",
          params: { toolName: "do-thing", toolInput: {} },
          nextStepId: "b",
        },
        {
          id: "a",
          name: "A2",
          description: "Duplicate",
          type: "end",
        },
        {
          id: "b",
          name: "B",
          description: "End",
          type: "end",
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow);
    expect(hasDiagnostic(result.diagnostics, "DUPLICATE_STEP_ID")).toBe(true);
    expect(result.graph).toBeNull();
  });
});

// ─── Graph analysis ──────────────────────────────────────────────

describe("graph analysis", () => {
  test("unreachable step", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "start",
      steps: [
        {
          id: "start",
          name: "Start",
          description: "First",
          type: "tool-call",
          params: { toolName: "do-thing", toolInput: {} },
          nextStepId: "done",
        },
        {
          id: "done",
          name: "Done",
          description: "End",
          type: "end",
        },
        {
          id: "orphan",
          name: "Orphan",
          description: "Never reached",
          type: "tool-call",
          params: { toolName: "do-thing", toolInput: {} },
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow);
    expect(hasDiagnostic(result.diagnostics, "UNREACHABLE_STEP")).toBe(true);
    const diag = getFirstDiagnostic(result.diagnostics, "UNREACHABLE_STEP");
    expect(diag.location.stepId).toBe("orphan");
  });

  test("simple cycle: A → B → A", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "a",
      steps: [
        {
          id: "a",
          name: "A",
          description: "Step A",
          type: "tool-call",
          params: { toolName: "do-thing", toolInput: {} },
          nextStepId: "b",
        },
        {
          id: "b",
          name: "B",
          description: "Step B",
          type: "tool-call",
          params: { toolName: "do-thing", toolInput: {} },
          nextStepId: "a",
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow);
    expect(hasDiagnostic(result.diagnostics, "CYCLE_DETECTED")).toBe(true);
    expect(result.graph).toBeNull();
  });

  test("self-referencing step", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "loop",
      steps: [
        {
          id: "loop",
          name: "Loop",
          description: "Loops forever",
          type: "tool-call",
          params: { toolName: "do-thing", toolInput: {} },
          nextStepId: "loop",
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow);
    expect(hasDiagnostic(result.diagnostics, "CYCLE_DETECTED")).toBe(true);
  });

  test("cycle inside a branch body", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "sw",
      steps: [
        {
          id: "sw",
          name: "Switch",
          description: "Branch",
          type: "switch-case",
          params: {
            switchOn: { type: "literal", value: true },
            cases: [
              {
                value: { type: "literal", value: true },
                branchBodyStepId: "branch_a",
              },
            ],
          },
          nextStepId: "done",
        },
        {
          id: "branch_a",
          name: "Branch A",
          description: "Branch start",
          type: "tool-call",
          params: { toolName: "do-thing", toolInput: {} },
          nextStepId: "branch_b",
        },
        {
          id: "branch_b",
          name: "Branch B",
          description: "Branch end, loops back",
          type: "tool-call",
          params: { toolName: "do-thing", toolInput: {} },
          nextStepId: "branch_a",
        },
        {
          id: "done",
          name: "Done",
          description: "End",
          type: "end",
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow);
    expect(hasDiagnostic(result.diagnostics, "CYCLE_DETECTED")).toBe(true);
  });
});

// ─── Control flow validation ─────────────────────────────────────

describe("control flow validation", () => {
  test("end step with nextStepId", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "done",
      steps: [
        {
          id: "done",
          name: "Done",
          description: "End but has next",
          type: "end",
          nextStepId: "extra",
        },
        {
          id: "extra",
          name: "Extra",
          description: "Shouldn't be here",
          type: "end",
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow);
    expect(hasDiagnostic(result.diagnostics, "END_STEP_HAS_NEXT")).toBe(true);
  });

  test("switch-case with multiple default cases", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "sw",
      steps: [
        {
          id: "sw",
          name: "Switch",
          description: "Two defaults",
          type: "switch-case",
          params: {
            switchOn: { type: "literal", value: "x" },
            cases: [
              {
                value: { type: "default" },
                branchBodyStepId: "b1",
              },
              {
                value: { type: "default" },
                branchBodyStepId: "b2",
              },
            ],
          },
          nextStepId: "done",
        },
        {
          id: "b1",
          name: "B1",
          description: "Branch 1",
          type: "end",
        },
        {
          id: "b2",
          name: "B2",
          description: "Branch 2",
          type: "end",
        },
        {
          id: "done",
          name: "Done",
          description: "End",
          type: "end",
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow);
    expect(hasDiagnostic(result.diagnostics, "MULTIPLE_DEFAULT_CASES")).toBe(
      true,
    );
  });

  test("loop body that escapes to main flow", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "get_data",
      steps: [
        {
          id: "get_data",
          name: "Get Data",
          description: "Fetch data",
          type: "tool-call",
          params: { toolName: "do-thing", toolInput: {} },
          nextStepId: "loop",
        },
        {
          id: "loop",
          name: "Loop",
          description: "Iterate",
          type: "for-each",
          params: {
            target: { type: "literal", value: [1, 2] },
            itemName: "item",
            loopBodyStepId: "body_step",
          },
          nextStepId: "after_loop",
        },
        {
          id: "body_step",
          name: "Body Step",
          description: "In loop body",
          type: "tool-call",
          params: { toolName: "do-thing", toolInput: {} },
          nextStepId: "after_loop", // This escapes!
        },
        {
          id: "after_loop",
          name: "After Loop",
          description: "Continue after loop",
          type: "end",
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow);
    expect(hasDiagnostic(result.diagnostics, "LOOP_BODY_ESCAPES")).toBe(true);
  });

  test("branch body that escapes to main flow", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "sw",
      steps: [
        {
          id: "sw",
          name: "Switch",
          description: "Branch",
          type: "switch-case",
          params: {
            switchOn: { type: "literal", value: true },
            cases: [
              {
                value: { type: "literal", value: true },
                branchBodyStepId: "branch_step",
              },
            ],
          },
          nextStepId: "after_branch",
        },
        {
          id: "branch_step",
          name: "Branch Step",
          description: "In branch",
          type: "tool-call",
          params: { toolName: "do-thing", toolInput: {} },
          nextStepId: "after_branch", // This escapes!
        },
        {
          id: "after_branch",
          name: "After Branch",
          description: "Continue after",
          type: "end",
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow);
    expect(hasDiagnostic(result.diagnostics, "BRANCH_BODY_ESCAPES")).toBe(true);
  });
});

// ─── JMESPath syntax validation ──────────────────────────────────

describe("jmespath syntax validation", () => {
  test("invalid jmespath in tool-call expression", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "a",
      steps: [
        {
          id: "a",
          name: "A",
          description: "Bad expression",
          type: "tool-call",
          params: {
            toolName: "do-thing",
            toolInput: {
              data: {
                type: "jmespath",
                expression: "foo[?bar ==",
              },
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

    const result = await compileWorkflow(workflow);
    expect(hasDiagnostic(result.diagnostics, "JMESPATH_SYNTAX_ERROR")).toBe(
      true,
    );
    const diag = getFirstDiagnostic(
      result.diagnostics,
      "JMESPATH_SYNTAX_ERROR",
    );
    expect(diag.location.stepId).toBe("a");
    expect(diag.location.field).toContain("data");
  });

  test("invalid jmespath in llm-prompt template", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "prev",
      steps: [
        {
          id: "prev",
          name: "Prev",
          description: "Previous step",
          type: "tool-call",
          params: { toolName: "do-thing", toolInput: {} },
          nextStepId: "prompt",
        },
        {
          id: "prompt",
          name: "Prompt",
          description: "LLM step with bad template expression",
          type: "llm-prompt",
          params: {
            prompt: "Hello ${foo..bar} world",
            outputFormat: { type: "object" },
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

    const result = await compileWorkflow(workflow);
    expect(hasDiagnostic(result.diagnostics, "JMESPATH_SYNTAX_ERROR")).toBe(
      true,
    );
  });

  test("valid jmespath expressions produce no syntax errors", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "get",
      steps: [
        {
          id: "get",
          name: "Get",
          description: "Fetch data",
          type: "tool-call",
          params: { toolName: "do-thing", toolInput: {} },
          nextStepId: "use",
        },
        {
          id: "use",
          name: "Use",
          description: "Use data",
          type: "tool-call",
          params: {
            toolName: "do-thing",
            toolInput: {
              a: { type: "jmespath", expression: "get.items" },
              b: { type: "jmespath", expression: "length(get.items)" },
              c: {
                type: "jmespath",
                expression: "get.items[?status == 'active']",
              },
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

    const result = await compileWorkflow(workflow);
    expect(hasDiagnostic(result.diagnostics, "JMESPATH_SYNTAX_ERROR")).toBe(
      false,
    );
  });

  test("invalid jmespath in for-each target", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "loop",
      steps: [
        {
          id: "loop",
          name: "Loop",
          description: "Bad target expression",
          type: "for-each",
          params: {
            target: { type: "jmespath", expression: "[??" },
            itemName: "x",
            loopBodyStepId: "body",
          },
          nextStepId: "done",
        },
        {
          id: "body",
          name: "Body",
          description: "Loop body",
          type: "end",
        },
        {
          id: "done",
          name: "Done",
          description: "End",
          type: "end",
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow);
    expect(hasDiagnostic(result.diagnostics, "JMESPATH_SYNTAX_ERROR")).toBe(
      true,
    );
  });

  test("invalid jmespath in switch-case switchOn", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "sw",
      steps: [
        {
          id: "sw",
          name: "Switch",
          description: "Bad switchOn",
          type: "switch-case",
          params: {
            switchOn: { type: "jmespath", expression: "..invalid" },
            cases: [
              {
                value: { type: "default" },
                branchBodyStepId: "b",
              },
            ],
          },
          nextStepId: "done",
        },
        {
          id: "b",
          name: "Branch",
          description: "Branch body",
          type: "end",
        },
        {
          id: "done",
          name: "Done",
          description: "End",
          type: "end",
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow);
    expect(hasDiagnostic(result.diagnostics, "JMESPATH_SYNTAX_ERROR")).toBe(
      true,
    );
  });
});

// ─── JMESPath scope/reference validation ─────────────────────────

describe("jmespath scope validation", () => {
  test("referencing a predecessor step is valid", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "get",
      steps: [
        {
          id: "get",
          name: "Get",
          description: "Fetch data",
          type: "tool-call",
          params: { toolName: "do-thing", toolInput: {} },
          nextStepId: "use",
        },
        {
          id: "use",
          name: "Use",
          description: "Use data from get",
          type: "tool-call",
          params: {
            toolName: "do-thing",
            toolInput: {
              data: { type: "jmespath", expression: "get.result" },
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

    const result = await compileWorkflow(workflow);
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_ROOT_REFERENCE"),
    ).toBe(false);
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_FORWARD_REFERENCE"),
    ).toBe(false);
  });

  test("referencing a non-existent step ID produces error", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "a",
      steps: [
        {
          id: "a",
          name: "A",
          description: "Step A",
          type: "tool-call",
          params: {
            toolName: "do-thing",
            toolInput: {
              data: { type: "jmespath", expression: "phantom.value" },
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

    const result = await compileWorkflow(workflow);
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_ROOT_REFERENCE"),
    ).toBe(true);
    const diag = getFirstDiagnostic(
      result.diagnostics,
      "JMESPATH_INVALID_ROOT_REFERENCE",
    );
    expect(diag.message).toContain("phantom");
  });

  test("forward reference produces warning", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "a",
      steps: [
        {
          id: "a",
          name: "A",
          description: "References B which hasn't executed yet",
          type: "tool-call",
          params: {
            toolName: "do-thing",
            toolInput: {
              data: { type: "jmespath", expression: "b.value" },
            },
          },
          nextStepId: "b",
        },
        {
          id: "b",
          name: "B",
          description: "Step B",
          type: "tool-call",
          params: { toolName: "do-thing", toolInput: {} },
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

    const result = await compileWorkflow(workflow);
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_FORWARD_REFERENCE"),
    ).toBe(true);
  });

  test("loop variable is valid inside loop body", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "get",
      steps: [
        {
          id: "get",
          name: "Get",
          description: "Fetch items",
          type: "tool-call",
          params: { toolName: "do-thing", toolInput: {} },
          nextStepId: "loop",
        },
        {
          id: "loop",
          name: "Loop",
          description: "Iterate",
          type: "for-each",
          params: {
            target: { type: "jmespath", expression: "get.items" },
            itemName: "item",
            loopBodyStepId: "body",
          },
          nextStepId: "done",
        },
        {
          id: "body",
          name: "Body",
          description: "Loop body uses item",
          type: "tool-call",
          params: {
            toolName: "do-thing",
            toolInput: {
              name: { type: "jmespath", expression: "item.name" },
            },
          },
        },
        {
          id: "done",
          name: "Done",
          description: "End",
          type: "end",
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow);
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_ROOT_REFERENCE"),
    ).toBe(false);
  });

  test("loop variable is NOT valid outside loop body", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "get",
      steps: [
        {
          id: "get",
          name: "Get",
          description: "Fetch items",
          type: "tool-call",
          params: { toolName: "do-thing", toolInput: {} },
          nextStepId: "loop",
        },
        {
          id: "loop",
          name: "Loop",
          description: "Iterate",
          type: "for-each",
          params: {
            target: { type: "literal", value: [1, 2] },
            itemName: "item",
            loopBodyStepId: "body",
          },
          nextStepId: "after",
        },
        {
          id: "body",
          name: "Body",
          description: "Loop body",
          type: "end",
        },
        {
          id: "after",
          name: "After",
          description: "After loop, tries to use loop var",
          type: "tool-call",
          params: {
            toolName: "do-thing",
            toolInput: {
              data: { type: "jmespath", expression: "item.name" },
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

    const result = await compileWorkflow(workflow);
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_ROOT_REFERENCE"),
    ).toBe(true);
    const diag = getFirstDiagnostic(
      result.diagnostics,
      "JMESPATH_INVALID_ROOT_REFERENCE",
    );
    expect(diag.message).toContain("item");
  });

  test("nested loop: inner body can access both loop variables", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "get",
      steps: [
        {
          id: "get",
          name: "Get",
          description: "Fetch data",
          type: "tool-call",
          params: { toolName: "do-thing", toolInput: {} },
          nextStepId: "outer_loop",
        },
        {
          id: "outer_loop",
          name: "Outer Loop",
          description: "Outer",
          type: "for-each",
          params: {
            target: { type: "jmespath", expression: "get.groups" },
            itemName: "group",
            loopBodyStepId: "inner_loop",
          },
          nextStepId: "done",
        },
        {
          id: "inner_loop",
          name: "Inner Loop",
          description: "Inner",
          type: "for-each",
          params: {
            target: { type: "jmespath", expression: "group.items" },
            itemName: "inner_item",
            loopBodyStepId: "process",
          },
        },
        {
          id: "process",
          name: "Process",
          description: "Uses both loop vars",
          type: "tool-call",
          params: {
            toolName: "do-thing",
            toolInput: {
              group_name: { type: "jmespath", expression: "group.name" },
              item_name: { type: "jmespath", expression: "inner_item.name" },
            },
          },
        },
        {
          id: "done",
          name: "Done",
          description: "End",
          type: "end",
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow);
    const scopeErrors = getDiagnostics(
      result.diagnostics,
      "JMESPATH_INVALID_ROOT_REFERENCE",
    );
    expect(scopeErrors).toHaveLength(0);
  });

  test("for-each target cannot use its own itemName", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "loop",
      steps: [
        {
          id: "loop",
          name: "Loop",
          description: "Target uses own itemName",
          type: "for-each",
          params: {
            target: { type: "jmespath", expression: "item.things" },
            itemName: "item",
            loopBodyStepId: "body",
          },
          nextStepId: "done",
        },
        {
          id: "body",
          name: "Body",
          description: "Loop body",
          type: "end",
        },
        {
          id: "done",
          name: "Done",
          description: "End",
          type: "end",
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow);
    // "item" is not a step ID and is not in scope at the for-each step itself
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_ROOT_REFERENCE"),
    ).toBe(true);
  });

  test("hyphenated step IDs produce INVALID_STEP_ID errors", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "get-data",
      steps: [
        {
          id: "get-data",
          name: "Get Data",
          description: "Fetch data",
          type: "tool-call",
          params: { toolName: "do-thing", toolInput: {} },
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

    const result = await compileWorkflow(workflow);
    expect(hasDiagnostic(result.diagnostics, "INVALID_STEP_ID")).toBe(true);
    const diag = getFirstDiagnostic(result.diagnostics, "INVALID_STEP_ID");
    expect(diag.location.stepId).toBe("get-data");
    expect(diag.message).toContain("underscores");
  });
});

// ─── Tool validation ─────────────────────────────────────────────

describe("tool validation", () => {
  test("unknown tool produces error", async () => {
    const workflow = makeWorkflow();
    // Override the tool name to something not in testTools
    (workflow.steps[0] as { params: { toolName: string } }).params.toolName =
      "nonexistent-tool";

    const result = await compileWorkflow(workflow, { tools: testTools });
    expect(hasDiagnostic(result.diagnostics, "UNKNOWN_TOOL")).toBe(true);
  });

  test("extra tool input key produces warning", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "step",
      steps: [
        {
          id: "step",
          name: "Step",
          description: "Has extra key",
          type: "tool-call",
          params: {
            toolName: "send-slack-message",
            toolInput: {
              channel: { type: "literal", value: "#general" },
              message: { type: "literal", value: "hi" },
              extraField: { type: "literal", value: "oops" },
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

    const result = await compileWorkflow(workflow, { tools: testTools });
    expect(hasDiagnostic(result.diagnostics, "EXTRA_TOOL_INPUT_KEY")).toBe(
      true,
    );
    const diag = getFirstDiagnostic(result.diagnostics, "EXTRA_TOOL_INPUT_KEY");
    expect(diag.message).toContain("extraField");
  });

  test("missing required tool input key produces error", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "step",
      steps: [
        {
          id: "step",
          name: "Step",
          description: "Missing required key",
          type: "tool-call",
          params: {
            toolName: "page-on-call-engineer",
            toolInput: {
              ticketId: { type: "literal", value: "TKT-001" },
              // Missing "reason" which is required
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

    const result = await compileWorkflow(workflow, { tools: testTools });
    expect(hasDiagnostic(result.diagnostics, "MISSING_TOOL_INPUT_KEY")).toBe(
      true,
    );
    const diag = getFirstDiagnostic(
      result.diagnostics,
      "MISSING_TOOL_INPUT_KEY",
    );
    expect(diag.message).toContain("reason");
  });

  test("tool with empty input schema and no inputs is valid", async () => {
    const workflow = makeWorkflow();
    const result = await compileWorkflow(workflow, { tools: testTools });
    expect(hasDiagnostic(result.diagnostics, "UNKNOWN_TOOL")).toBe(false);
    expect(hasDiagnostic(result.diagnostics, "MISSING_TOOL_INPUT_KEY")).toBe(
      false,
    );
  });

  test("no tool definitions provided skips tool validation", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "step",
      steps: [
        {
          id: "step",
          name: "Step",
          description: "Unknown tool",
          type: "tool-call",
          params: {
            toolName: "totally-fake-tool",
            toolInput: {},
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

    // No tools option — no tool errors
    const result = await compileWorkflow(workflow);
    expect(hasDiagnostic(result.diagnostics, "UNKNOWN_TOOL")).toBe(false);
  });
});

// ─── Edge cases ──────────────────────────────────────────────────

describe("edge cases", () => {
  test("empty steps array with non-existent initial step", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "nonexistent",
      steps: [],
    } as unknown as WorkflowDefinition;

    const result = await compileWorkflow(workflow);
    expect(hasDiagnostic(result.diagnostics, "MISSING_INITIAL_STEP")).toBe(
      true,
    );
    expect(result.graph).toBeNull();
  });

  test("jmespath expression that is just a function call with no field refs", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "a",
      steps: [
        {
          id: "a",
          name: "A",
          description: "Uses literal-only jmespath",
          type: "tool-call",
          params: {
            toolName: "do-thing",
            toolInput: {
              // This is valid JMESPath but references no step
              val: { type: "jmespath", expression: "length(`[1,2,3]`)" },
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

    const result = await compileWorkflow(workflow);
    // Should not produce any reference errors since there are no field references
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_ROOT_REFERENCE"),
    ).toBe(false);
  });

  test("literal expressions are not validated as jmespath", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "a",
      steps: [
        {
          id: "a",
          name: "A",
          description: "Uses literals only",
          type: "tool-call",
          params: {
            toolName: "do-thing",
            toolInput: {
              val: { type: "literal", value: "not jmespath at all {{}}[]" },
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

    const result = await compileWorkflow(workflow);
    expect(hasDiagnostic(result.diagnostics, "JMESPATH_SYNTAX_ERROR")).toBe(
      false,
    );
  });

  test("multiple errors are reported in a single compilation", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "a",
      steps: [
        {
          id: "a",
          name: "A",
          description: "Multiple issues",
          type: "tool-call",
          params: {
            toolName: "fake-tool",
            toolInput: {
              bad: { type: "jmespath", expression: "nonexistent.field" },
            },
          },
          nextStepId: "ghost",
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow, { tools: testTools });
    // Should have: MISSING_NEXT_STEP, UNKNOWN_TOOL, JMESPATH_INVALID_ROOT_REFERENCE
    expect(hasDiagnostic(result.diagnostics, "MISSING_NEXT_STEP")).toBe(true);
    expect(hasDiagnostic(result.diagnostics, "UNKNOWN_TOOL")).toBe(true);
  });

  test("llm-prompt with no template expressions is valid", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "prompt",
      steps: [
        {
          id: "prompt",
          name: "Prompt",
          description: "Simple prompt with no expressions",
          type: "llm-prompt",
          params: {
            prompt: "Hello world, no expressions here",
            outputFormat: { type: "object" },
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

    const result = await compileWorkflow(workflow);
    expect(errors(result.diagnostics)).toHaveLength(0);
  });

  test("switch-case with valid step references in all branches", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "get",
      steps: [
        {
          id: "get",
          name: "Get",
          description: "Fetch",
          type: "tool-call",
          params: { toolName: "do-thing", toolInput: {} },
          nextStepId: "sw",
        },
        {
          id: "sw",
          name: "Switch",
          description: "Branch",
          type: "switch-case",
          params: {
            switchOn: { type: "jmespath", expression: "get.status" },
            cases: [
              {
                value: { type: "literal", value: "ok" },
                branchBodyStepId: "handle_ok",
              },
              {
                value: { type: "default" },
                branchBodyStepId: "handle_other",
              },
            ],
          },
          nextStepId: "done",
        },
        {
          id: "handle_ok",
          name: "Handle OK",
          description: "OK branch",
          type: "tool-call",
          params: {
            toolName: "do-thing",
            toolInput: {
              val: { type: "jmespath", expression: "get.data" },
            },
          },
        },
        {
          id: "handle_other",
          name: "Handle Other",
          description: "Default branch",
          type: "tool-call",
          params: {
            toolName: "do-thing",
            toolInput: {
              val: { type: "jmespath", expression: "get.error" },
            },
          },
        },
        {
          id: "done",
          name: "Done",
          description: "End",
          type: "end",
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow);
    expect(errors(result.diagnostics)).toHaveLength(0);
  });
});

// ─── Bug regression: self-reference, shadowing, templates, scoping ──

describe("self-reference and predecessor correctness", () => {
  test("step referencing its own output gets forward reference warning", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "a",
      steps: [
        {
          id: "a",
          name: "A",
          description: "References itself",
          type: "tool-call",
          params: {
            toolName: "do-thing",
            toolInput: {
              val: { type: "jmespath", expression: "a.result" },
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

    const result = await compileWorkflow(workflow);
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_FORWARD_REFERENCE"),
    ).toBe(true);
    const diag = getFirstDiagnostic(
      result.diagnostics,
      "JMESPATH_FORWARD_REFERENCE",
    );
    expect(diag.location.stepId).toBe("a");
  });

  test("predecessor transitivity: A→B→C, C can reference A", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "a",
      steps: [
        {
          id: "a",
          name: "A",
          description: "First",
          type: "tool-call",
          params: { toolName: "do-thing", toolInput: {} },
          nextStepId: "b",
        },
        {
          id: "b",
          name: "B",
          description: "Second",
          type: "tool-call",
          params: { toolName: "do-thing", toolInput: {} },
          nextStepId: "c",
        },
        {
          id: "c",
          name: "C",
          description: "Third — references A (two steps back)",
          type: "tool-call",
          params: {
            toolName: "do-thing",
            toolInput: {
              from_a: { type: "jmespath", expression: "a.value" },
              from_b: { type: "jmespath", expression: "b.value" },
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

    const result = await compileWorkflow(workflow);
    // Both a and b should be valid predecessors of c
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_FORWARD_REFERENCE"),
    ).toBe(false);
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_ROOT_REFERENCE"),
    ).toBe(false);
  });

  test("step after switch-case cannot reference branch-only step", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "sw",
      steps: [
        {
          id: "sw",
          name: "Switch",
          description: "Branch",
          type: "switch-case",
          params: {
            switchOn: { type: "literal", value: true },
            cases: [
              {
                value: { type: "literal", value: true },
                branchBodyStepId: "branch_only",
              },
            ],
          },
          nextStepId: "after_switch",
        },
        {
          id: "branch_only",
          name: "Branch Only",
          description: "Only runs if case matches",
          type: "tool-call",
          params: { toolName: "do-thing", toolInput: {} },
        },
        {
          id: "after_switch",
          name: "After Switch",
          description: "References branch step — may not have executed",
          type: "tool-call",
          params: {
            toolName: "do-thing",
            toolInput: {
              val: { type: "jmespath", expression: "branch_only.result" },
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

    const result = await compileWorkflow(workflow);
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_FORWARD_REFERENCE"),
    ).toBe(true);
    const diag = getFirstDiagnostic(
      result.diagnostics,
      "JMESPATH_FORWARD_REFERENCE",
    );
    expect(diag.message).toContain("branch_only");
  });

  test("step after wait-for-condition can reference body chain step", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "wait_done",
      steps: [
        {
          id: "wait_done",
          name: "Wait",
          description: "Poll until done",
          type: "wait-for-condition",
          params: {
            conditionStepId: "poll_status",
            condition: {
              type: "jmespath",
              expression: "poll_status.status == 'done'",
            },
          },
          nextStepId: "branch_status",
        },
        {
          id: "poll_status",
          name: "Poll",
          description: "Body chain terminator (no nextStepId)",
          type: "tool-call",
          params: { toolName: "do-thing", toolInput: {} },
        },
        {
          id: "branch_status",
          name: "Branch",
          description: "References body chain output of wait_done",
          type: "switch-case",
          params: {
            switchOn: { type: "jmespath", expression: "poll_status.status" },
            cases: [
              {
                value: { type: "literal", value: "done" },
                branchBodyStepId: "done",
              },
            ],
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

    const result = await compileWorkflow(workflow);
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_FORWARD_REFERENCE"),
    ).toBe(false);
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_ROOT_REFERENCE"),
    ).toBe(false);
  });

  test("step after wait-for-condition can reference multi-step body chain", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "wait_done",
      steps: [
        {
          id: "wait_done",
          name: "Wait",
          description: "Poll with two-step body",
          type: "wait-for-condition",
          params: {
            conditionStepId: "fetch_status",
            condition: {
              type: "jmespath",
              expression: "parse_status.ready",
            },
          },
          nextStepId: "after_wait",
        },
        {
          id: "fetch_status",
          name: "Fetch",
          description: "First body step",
          type: "tool-call",
          params: { toolName: "do-thing", toolInput: {} },
          nextStepId: "parse_status",
        },
        {
          id: "parse_status",
          name: "Parse",
          description: "Second body step (linear)",
          type: "tool-call",
          params: {
            toolName: "do-thing",
            toolInput: {
              raw: { type: "jmespath", expression: "fetch_status.body" },
            },
          },
        },
        {
          id: "after_wait",
          name: "After",
          description: "References both body steps",
          type: "tool-call",
          params: {
            toolName: "do-thing",
            toolInput: {
              raw: { type: "jmespath", expression: "fetch_status.body" },
              parsed: { type: "jmespath", expression: "parse_status.value" },
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

    const result = await compileWorkflow(workflow);
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_FORWARD_REFERENCE"),
    ).toBe(false);
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_ROOT_REFERENCE"),
    ).toBe(false);
  });

  test("step after nested wait-for-condition can reference inner body step", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "outer_wait",
      steps: [
        {
          id: "outer_wait",
          name: "Outer Wait",
          description: "Outer poll",
          type: "wait-for-condition",
          params: {
            conditionStepId: "inner_wait",
            condition: {
              type: "jmespath",
              expression: "poll.done",
            },
          },
          nextStepId: "after_outer",
        },
        {
          id: "inner_wait",
          name: "Inner Wait",
          description: "Inner poll, body of outer_wait",
          type: "wait-for-condition",
          params: {
            conditionStepId: "poll",
            condition: {
              type: "jmespath",
              expression: "poll.ready",
            },
          },
        },
        {
          id: "poll",
          name: "Poll",
          description: "Innermost body step",
          type: "tool-call",
          params: { toolName: "do-thing", toolInput: {} },
        },
        {
          id: "after_outer",
          name: "After Outer",
          description: "References innermost body step",
          type: "tool-call",
          params: {
            toolName: "do-thing",
            toolInput: {
              val: { type: "jmespath", expression: "poll.value" },
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

    const result = await compileWorkflow(workflow);
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_FORWARD_REFERENCE"),
    ).toBe(false);
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_ROOT_REFERENCE"),
    ).toBe(false);
  });

  test("step before wait-for-condition still cannot reference body chain step", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "before_wait",
      steps: [
        {
          id: "before_wait",
          name: "Before",
          description: "Runs before the wait — body has not executed yet",
          type: "tool-call",
          params: {
            toolName: "do-thing",
            toolInput: {
              val: { type: "jmespath", expression: "poll_status.value" },
            },
          },
          nextStepId: "wait_done",
        },
        {
          id: "wait_done",
          name: "Wait",
          description: "Poll",
          type: "wait-for-condition",
          params: {
            conditionStepId: "poll_status",
            condition: {
              type: "jmespath",
              expression: "poll_status.done",
            },
          },
          nextStepId: "done",
        },
        {
          id: "poll_status",
          name: "Poll",
          description: "Body step",
          type: "tool-call",
          params: { toolName: "do-thing", toolInput: {} },
        },
        {
          id: "done",
          name: "Done",
          description: "End",
          type: "end",
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow);
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_FORWARD_REFERENCE"),
    ).toBe(true);
    const diag = getFirstDiagnostic(
      result.diagnostics,
      "JMESPATH_FORWARD_REFERENCE",
    );
    expect(diag.location.stepId).toBe("before_wait");
    expect(diag.message).toContain("poll_status");
  });

  test("multiple roots in one expression: mixed valid and invalid", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "a",
      steps: [
        {
          id: "a",
          name: "A",
          description: "First",
          type: "tool-call",
          params: { toolName: "do-thing", toolInput: {} },
          nextStepId: "b",
        },
        {
          id: "b",
          name: "B",
          description: "Uses join with valid and invalid refs",
          type: "tool-call",
          params: {
            toolName: "do-thing",
            toolInput: {
              val: {
                type: "jmespath",
                expression: "join(', ', [a.name, nonexistent.name])",
              },
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

    const result = await compileWorkflow(workflow);
    // a.name is valid, nonexistent.name is not
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_ROOT_REFERENCE"),
    ).toBe(true);
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_FORWARD_REFERENCE"),
    ).toBe(false);
    const diag = getFirstDiagnostic(
      result.diagnostics,
      "JMESPATH_INVALID_ROOT_REFERENCE",
    );
    expect(diag.message).toContain("nonexistent");
  });
});

describe("itemName validation", () => {
  test("invalid itemName format produces error", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "loop",
      steps: [
        {
          id: "loop",
          name: "Loop",
          description: "Invalid item name",
          type: "for-each",
          params: {
            target: { type: "literal", value: [1, 2] },
            itemName: "my-item",
            loopBodyStepId: "body",
          },
          nextStepId: "done",
        },
        {
          id: "body",
          name: "Body",
          description: "Loop body",
          type: "end",
        },
        {
          id: "done",
          name: "Done",
          description: "End",
          type: "end",
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow);
    expect(hasDiagnostic(result.diagnostics, "INVALID_ITEM_NAME")).toBe(true);
    const diag = getFirstDiagnostic(result.diagnostics, "INVALID_ITEM_NAME");
    expect(diag.message).toContain("my-item");
  });

  test("itemName starting with number produces error", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "loop",
      steps: [
        {
          id: "loop",
          name: "Loop",
          description: "Numeric item name",
          type: "for-each",
          params: {
            target: { type: "literal", value: [1] },
            itemName: "123item",
            loopBodyStepId: "body",
          },
          nextStepId: "done",
        },
        {
          id: "body",
          name: "Body",
          description: "Body",
          type: "end",
        },
        {
          id: "done",
          name: "Done",
          description: "End",
          type: "end",
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow);
    expect(hasDiagnostic(result.diagnostics, "INVALID_ITEM_NAME")).toBe(true);
  });

  test("itemName that shadows a step ID produces warning", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "data",
      steps: [
        {
          id: "data",
          name: "Data",
          description: "Get data",
          type: "tool-call",
          params: { toolName: "do-thing", toolInput: {} },
          nextStepId: "loop",
        },
        {
          id: "loop",
          name: "Loop",
          description: "itemName shadows step ID",
          type: "for-each",
          params: {
            target: { type: "jmespath", expression: "data.items" },
            itemName: "data",
            loopBodyStepId: "body",
          },
          nextStepId: "done",
        },
        {
          id: "body",
          name: "Body",
          description: "Inside loop, 'data' is ambiguous",
          type: "tool-call",
          params: {
            toolName: "do-thing",
            toolInput: {
              val: { type: "jmespath", expression: "data.name" },
            },
          },
        },
        {
          id: "done",
          name: "Done",
          description: "End",
          type: "end",
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow);
    expect(hasDiagnostic(result.diagnostics, "ITEM_NAME_SHADOWS_STEP_ID")).toBe(
      true,
    );
    const diag = getFirstDiagnostic(
      result.diagnostics,
      "ITEM_NAME_SHADOWS_STEP_ID",
    );
    expect(diag.message).toContain("shadows");
    expect(diag.message).toContain("data");
  });

  test("valid itemName with underscore format passes", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "get",
      steps: [
        {
          id: "get",
          name: "Get",
          description: "Fetch",
          type: "tool-call",
          params: { toolName: "do-thing", toolInput: {} },
          nextStepId: "loop",
        },
        {
          id: "loop",
          name: "Loop",
          description: "Valid item name",
          type: "for-each",
          params: {
            target: { type: "jmespath", expression: "get.items" },
            itemName: "current_item",
            loopBodyStepId: "body",
          },
          nextStepId: "done",
        },
        {
          id: "body",
          name: "Body",
          description: "Loop body",
          type: "tool-call",
          params: {
            toolName: "do-thing",
            toolInput: {
              val: { type: "jmespath", expression: "current_item.name" },
            },
          },
        },
        {
          id: "done",
          name: "Done",
          description: "End",
          type: "end",
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow);
    expect(hasDiagnostic(result.diagnostics, "INVALID_ITEM_NAME")).toBe(false);
    expect(hasDiagnostic(result.diagnostics, "ITEM_NAME_SHADOWS_STEP_ID")).toBe(
      false,
    );
    expect(errors(result.diagnostics)).toHaveLength(0);
  });
});

describe("template expression edge cases", () => {
  test("unclosed template expression produces error", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "prompt",
      steps: [
        {
          id: "prompt",
          name: "Prompt",
          description: "Unclosed template",
          type: "llm-prompt",
          params: {
            prompt: "Hello ${user.name world",
            outputFormat: { type: "object" },
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

    const result = await compileWorkflow(workflow);
    expect(
      hasDiagnostic(result.diagnostics, "UNCLOSED_TEMPLATE_EXPRESSION"),
    ).toBe(true);
  });

  test("empty template expression ${} is a JMESPath syntax error", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "prev",
      steps: [
        {
          id: "prev",
          name: "Prev",
          description: "Previous step",
          type: "tool-call",
          params: { toolName: "do-thing", toolInput: {} },
          nextStepId: "prompt",
        },
        {
          id: "prompt",
          name: "Prompt",
          description: "Empty template expression",
          type: "llm-prompt",
          params: {
            prompt: "Hello ${} world",
            outputFormat: { type: "object" },
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

    const result = await compileWorkflow(workflow);
    expect(hasDiagnostic(result.diagnostics, "JMESPATH_SYNTAX_ERROR")).toBe(
      true,
    );
  });

  test("$ without { is not treated as template expression", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "prompt",
      steps: [
        {
          id: "prompt",
          name: "Prompt",
          description: "Dollar sign without brace",
          type: "llm-prompt",
          params: {
            prompt: "Price is $100 and $200",
            outputFormat: { type: "object" },
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

    const result = await compileWorkflow(workflow);
    expect(hasDiagnostic(result.diagnostics, "JMESPATH_SYNTAX_ERROR")).toBe(
      false,
    );
    expect(
      hasDiagnostic(result.diagnostics, "UNCLOSED_TEMPLATE_EXPRESSION"),
    ).toBe(false);
  });

  test("multiple template expressions with one invalid", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "a",
      steps: [
        {
          id: "a",
          name: "A",
          description: "Fetch",
          type: "tool-call",
          params: { toolName: "do-thing", toolInput: {} },
          nextStepId: "prompt",
        },
        {
          id: "prompt",
          name: "Prompt",
          description: "Mixed valid and invalid template expressions",
          type: "llm-prompt",
          params: {
            prompt: "Hello ${a.name}, your balance is ${..invalid}",
            outputFormat: { type: "object" },
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

    const result = await compileWorkflow(workflow);
    // First expression is valid, second has bad JMESPath syntax
    expect(hasDiagnostic(result.diagnostics, "JMESPATH_SYNTAX_ERROR")).toBe(
      true,
    );
    // The valid one should not trigger reference errors
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_ROOT_REFERENCE"),
    ).toBe(false);
  });
});

describe("nested control flow scoping", () => {
  test("for-each inside switch-case branch has correct loop scope", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "get",
      steps: [
        {
          id: "get",
          name: "Get",
          description: "Fetch",
          type: "tool-call",
          params: { toolName: "do-thing", toolInput: {} },
          nextStepId: "sw",
        },
        {
          id: "sw",
          name: "Switch",
          description: "Branch",
          type: "switch-case",
          params: {
            switchOn: { type: "jmespath", expression: "get.type" },
            cases: [
              {
                value: { type: "literal", value: "list" },
                branchBodyStepId: "loop_in_branch",
              },
              {
                value: { type: "default" },
                branchBodyStepId: "default_handler",
              },
            ],
          },
          nextStepId: "done",
        },
        {
          id: "loop_in_branch",
          name: "Loop In Branch",
          description: "For-each nested inside a switch-case branch",
          type: "for-each",
          params: {
            target: { type: "jmespath", expression: "get.items" },
            itemName: "item",
            loopBodyStepId: "process_item",
          },
        },
        {
          id: "process_item",
          name: "Process Item",
          description: "Uses loop var and step output",
          type: "tool-call",
          params: {
            toolName: "do-thing",
            toolInput: {
              item_name: { type: "jmespath", expression: "item.name" },
              source: { type: "jmespath", expression: "get.source" },
            },
          },
        },
        {
          id: "default_handler",
          name: "Default Handler",
          description: "Default branch",
          type: "tool-call",
          params: { toolName: "do-thing", toolInput: {} },
        },
        {
          id: "done",
          name: "Done",
          description: "End",
          type: "end",
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow);
    // process_item should be able to access both "item" (loop var) and "get" (predecessor)
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_ROOT_REFERENCE"),
    ).toBe(false);
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_FORWARD_REFERENCE"),
    ).toBe(false);
    expect(errors(result.diagnostics)).toHaveLength(0);
  });

  test("loop variable from branch-nested loop is not available after switch-case", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "sw",
      steps: [
        {
          id: "sw",
          name: "Switch",
          description: "Branch with loop inside",
          type: "switch-case",
          params: {
            switchOn: { type: "literal", value: true },
            cases: [
              {
                value: { type: "literal", value: true },
                branchBodyStepId: "loop",
              },
            ],
          },
          nextStepId: "after",
        },
        {
          id: "loop",
          name: "Loop",
          description: "Loop in branch",
          type: "for-each",
          params: {
            target: { type: "literal", value: [1] },
            itemName: "x",
            loopBodyStepId: "body",
          },
        },
        {
          id: "body",
          name: "Body",
          description: "Loop body",
          type: "end",
        },
        {
          id: "after",
          name: "After",
          description: "After switch — tries to use loop var from branch",
          type: "tool-call",
          params: {
            toolName: "do-thing",
            toolInput: {
              val: { type: "jmespath", expression: "x.value" },
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

    const result = await compileWorkflow(workflow);
    // "x" is a loop variable only inside the branch's loop body, not after the switch
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_ROOT_REFERENCE"),
    ).toBe(true);
    const diag = getFirstDiagnostic(
      result.diagnostics,
      "JMESPATH_INVALID_ROOT_REFERENCE",
    );
    expect(diag.message).toContain("x");
  });
});

// ─── extract-data step validation ───────────────────────────────

describe("extract-data step validation", () => {
  test("valid extract-data with jmespath sourceData referencing predecessor", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "fetch",
      steps: [
        {
          id: "fetch",
          name: "Fetch",
          description: "Get raw data",
          type: "tool-call",
          params: { toolName: "do-thing", toolInput: {} },
          nextStepId: "extract",
        },
        {
          id: "extract",
          name: "Extract",
          description: "Extract structured data from raw output",
          type: "extract-data",
          params: {
            sourceData: { type: "jmespath", expression: "fetch.rawOutput" },
            outputFormat: {
              type: "object",
              properties: { name: { type: "string" } },
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

    const result = await compileWorkflow(workflow);
    expect(errors(result.diagnostics)).toHaveLength(0);
  });

  test("extract-data with invalid jmespath syntax produces error", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "extract",
      steps: [
        {
          id: "extract",
          name: "Extract",
          description: "Bad expression",
          type: "extract-data",
          params: {
            sourceData: { type: "jmespath", expression: "foo[??" },
            outputFormat: { type: "object" },
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

    const result = await compileWorkflow(workflow);
    expect(hasDiagnostic(result.diagnostics, "JMESPATH_SYNTAX_ERROR")).toBe(
      true,
    );
    const diag = getFirstDiagnostic(
      result.diagnostics,
      "JMESPATH_SYNTAX_ERROR",
    );
    expect(diag.location.stepId).toBe("extract");
    expect(diag.location.field).toBe("params.sourceData.expression");
  });

  test("extract-data referencing non-existent step produces error", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "extract",
      steps: [
        {
          id: "extract",
          name: "Extract",
          description: "References unknown step",
          type: "extract-data",
          params: {
            sourceData: { type: "jmespath", expression: "ghost.data" },
            outputFormat: { type: "object" },
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

    const result = await compileWorkflow(workflow);
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_ROOT_REFERENCE"),
    ).toBe(true);
    const diag = getFirstDiagnostic(
      result.diagnostics,
      "JMESPATH_INVALID_ROOT_REFERENCE",
    );
    expect(diag.message).toContain("ghost");
  });

  test("extract-data with literal sourceData is valid and not checked as jmespath", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "extract",
      steps: [
        {
          id: "extract",
          name: "Extract",
          description: "Literal source data",
          type: "extract-data",
          params: {
            sourceData: { type: "literal", value: { raw: "some text" } },
            outputFormat: { type: "object" },
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

    const result = await compileWorkflow(workflow);
    expect(errors(result.diagnostics)).toHaveLength(0);
  });

  test("extract-data inside for-each body can use loop variable", async () => {
    const workflow: WorkflowDefinition = {
      initialStepId: "get",
      steps: [
        {
          id: "get",
          name: "Get",
          description: "Fetch list",
          type: "tool-call",
          params: { toolName: "do-thing", toolInput: {} },
          nextStepId: "loop",
        },
        {
          id: "loop",
          name: "Loop",
          description: "Iterate",
          type: "for-each",
          params: {
            target: { type: "jmespath", expression: "get.items" },
            itemName: "item",
            loopBodyStepId: "extract",
          },
          nextStepId: "done",
        },
        {
          id: "extract",
          name: "Extract",
          description: "Extract from each item",
          type: "extract-data",
          params: {
            sourceData: { type: "jmespath", expression: "item.rawContent" },
            outputFormat: {
              type: "object",
              properties: { title: { type: "string" } },
            },
          },
        },
        {
          id: "done",
          name: "Done",
          description: "End",
          type: "end",
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow);
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_ROOT_REFERENCE"),
    ).toBe(false);
    expect(errors(result.diagnostics)).toHaveLength(0);
  });
});

// ─── Best Practices ──────────────────────────────────────────────

describe("best practices", () => {
  test("returns optimized workflow for a valid workflow", async () => {
    const workflow = makeWorkflow();
    const result = await compileWorkflow(workflow);
    expect(result.workflow).not.toBeNull();
  });

  test("optimized workflow is a deep copy (not the same reference)", async () => {
    const workflow = makeWorkflow();
    const result = await compileWorkflow(workflow);
    expect(result.workflow).not.toBe(workflow);
    expect(result.workflow?.steps).not.toBe(workflow.steps);
  });

  test("returns null workflow when there are errors", async () => {
    const workflow = makeWorkflow({
      initialStepId: "nonexistent",
    });
    const result = await compileWorkflow(workflow);
    expect(errors(result.diagnostics).length).toBeGreaterThan(0);
    expect(result.workflow).toBeNull();
  });

  describe("addMissingEndSteps", () => {
    test("does not modify a workflow where all chains end with end steps", async () => {
      const workflow = makeWorkflow();
      const result = await compileWorkflow(workflow);
      // makeWorkflow already has a "done" end step; +1 for auto-inserted __start
      expect(result.workflow?.steps).toHaveLength(workflow.steps.length + 1);
      const endSteps = result.workflow?.steps.filter((s) => s.type === "end");
      expect(endSteps).toHaveLength(1);
      expect(endSteps?.[0]?.id).toBe("done");
    });

    test("adds end step to a terminal non-end step on the main chain", async () => {
      const workflow = {
        initialStepId: "start",
        steps: [
          {
            id: "start",
            name: "Start",
            description: "First step",
            type: "tool-call",
            params: { toolName: "t", toolInput: {} },
            // no nextStepId, no end step
          },
        ],
      } as WorkflowDefinition;

      const result = await compileWorkflow(workflow);
      // +1 for auto-inserted __start, +1 for auto-inserted start_end
      expect(result.workflow?.steps).toHaveLength(3);
      const toolStep = result.workflow?.steps.find((s) => s.id === "start");
      expect(toolStep).toBeDefined();
      expect(toolStep?.nextStepId).toBe("start_end");
      const endStep = result.workflow?.steps.find((s) => s.id === "start_end");
      expect(endStep).toBeDefined();
      expect(endStep?.type).toBe("end");
    });

    test("adds end steps to terminal branch body steps", async () => {
      const workflow = {
        initialStepId: "check",
        steps: [
          {
            id: "check",
            name: "Check",
            description: "Branch on value",
            type: "switch-case",
            params: {
              switchOn: {
                type: "literal",
                value: "a",
              },
              cases: [
                {
                  value: { type: "literal", value: "a" },
                  branchBodyStepId: "handle_a",
                },
                {
                  value: { type: "default" },
                  branchBodyStepId: "handle_default",
                },
              ],
            },
            nextStepId: "finish",
          },
          {
            id: "handle_a",
            name: "Handle A",
            description: "Handle case A",
            type: "tool-call",
            params: { toolName: "t", toolInput: {} },
            // terminal - no nextStepId
          },
          {
            id: "handle_default",
            name: "Handle Default",
            description: "Handle default case",
            type: "tool-call",
            params: { toolName: "t", toolInput: {} },
            // terminal - no nextStepId
          },
          {
            id: "finish",
            name: "Finish",
            description: "Done",
            type: "end",
          },
        ],
      } as WorkflowDefinition;

      const result = await compileWorkflow(workflow);
      // Should have 2 new end steps added + 1 auto-inserted __start
      expect(result.workflow?.steps).toHaveLength(7);
      expect(
        result.workflow?.steps.find((s) => s.id === "handle_a")?.nextStepId,
      ).toBe("handle_a_end");
      expect(
        result.workflow?.steps.find((s) => s.id === "handle_default")
          ?.nextStepId,
      ).toBe("handle_default_end");
      expect(
        result.workflow?.steps.find((s) => s.id === "handle_a_end")?.type,
      ).toBe("end");
      expect(
        result.workflow?.steps.find((s) => s.id === "handle_default_end")?.type,
      ).toBe("end");
    });

    test("adds end step to terminal loop body step", async () => {
      const workflow = {
        initialStepId: "loop",
        steps: [
          {
            id: "loop",
            name: "Loop",
            description: "Loop over items",
            type: "for-each",
            params: {
              target: { type: "literal", value: [1, 2] },
              itemName: "item",
              loopBodyStepId: "process",
            },
            nextStepId: "finish",
          },
          {
            id: "process",
            name: "Process",
            description: "Process item",
            type: "tool-call",
            params: { toolName: "t", toolInput: {} },
            // terminal - no nextStepId
          },
          {
            id: "finish",
            name: "Finish",
            description: "Done",
            type: "end",
          },
        ],
      } as WorkflowDefinition;

      const result = await compileWorkflow(workflow);
      // +1 for auto-inserted __start
      expect(result.workflow?.steps).toHaveLength(5);
      expect(
        result.workflow?.steps.find((s) => s.id === "process")?.nextStepId,
      ).toBe("process_end");
      expect(
        result.workflow?.steps.find((s) => s.id === "process_end")?.type,
      ).toBe("end");
    });

    test("does not modify the original workflow", async () => {
      const workflow = {
        initialStepId: "start",
        steps: [
          {
            id: "start",
            name: "Start",
            description: "First step",
            type: "tool-call",
            params: { toolName: "t", toolInput: {} },
          },
        ],
      } as WorkflowDefinition;

      const originalStepCount = workflow.steps.length;
      const result = await compileWorkflow(workflow);
      // Original should be untouched
      expect(workflow.steps).toHaveLength(originalStepCount);
      expect(workflow.steps[0]?.nextStepId).toBeUndefined();
      // Compiled version should have the end step + auto-inserted __start
      expect(result.workflow?.steps).toHaveLength(3);
    });
  });

  test("returns null workflow when graph is null", async () => {
    // A workflow with a cycle will produce a null graph
    const workflow = {
      initialStepId: "aa",
      steps: [
        {
          id: "aa",
          name: "A",
          description: "A",
          type: "tool-call",
          params: { toolName: "t", toolInput: {} },
          nextStepId: "bb",
        },
        {
          id: "bb",
          name: "B",
          description: "B",
          type: "tool-call",
          params: { toolName: "t", toolInput: {} },
          nextStepId: "aa",
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow);
    expect(result.graph).toBeNull();
    expect(result.workflow).toBeNull();
  });

  describe("addMissingStartStep", () => {
    test("emits MISSING_START_STEP warning when no start step exists", async () => {
      const workflow = makeWorkflow();
      const result = await compileWorkflow(workflow);
      expect(hasDiagnostic(result.diagnostics, "MISSING_START_STEP")).toBe(
        true,
      );
      const diag = getFirstDiagnostic(result.diagnostics, "MISSING_START_STEP");
      expect(diag.severity).toBe("warning");
    });

    test("auto-inserts start step as initialStepId", async () => {
      const workflow = makeWorkflow();
      const result = await compileWorkflow(workflow);
      expect(result.workflow?.initialStepId).toBe("__start");
      const startStep = result.workflow?.steps.find((s) => s.id === "__start");
      expect(startStep).toBeDefined();
      expect(startStep?.type).toBe("start");
    });

    test("auto-inserted start step chains to the old initialStepId", async () => {
      const workflow = makeWorkflow();
      const result = await compileWorkflow(workflow);
      const startStep = result.workflow?.steps.find((s) => s.id === "__start");
      expect(startStep?.nextStepId).toBe("start");
    });

    test("auto-inserted start step is a no-op marker", async () => {
      const workflow = makeWorkflow();
      const result = await compileWorkflow(workflow);
      const startStep = result.workflow?.steps.find((s) => s.id === "__start");
      expect(startStep?.type).toBe("start");
    });

    test("does not emit warning when start step already exists", async () => {
      const workflow = {
        initialStepId: "entry",
        steps: [
          {
            id: "entry",
            name: "Entry",
            description: "Workflow entry point",
            type: "start",
            nextStepId: "do_work",
          },
          {
            id: "do_work",
            name: "Do Work",
            description: "Does work",
            type: "tool-call",
            params: { toolName: "do-thing", toolInput: {} },
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

      const result = await compileWorkflow(workflow);
      expect(hasDiagnostic(result.diagnostics, "MISSING_START_STEP")).toBe(
        false,
      );
      expect(errors(result.diagnostics)).toHaveLength(0);
    });
  });
});

// ─── Start step: JMESPath scope ─────────────────────────────────

describe("workflow input JMESPath scope", () => {
  test("references to 'input' alias are valid when inputSchema is defined", async () => {
    const workflow = {
      initialStepId: "entry",
      inputSchema: {
        type: "object",
        properties: { userId: { type: "string" } },
      },
      steps: [
        {
          id: "entry",
          name: "Entry",
          description: "Entry point",
          type: "start",
          nextStepId: "fetch_user",
        },
        {
          id: "fetch_user",
          name: "Fetch User",
          description: "Fetch user data",
          type: "tool-call",
          params: {
            toolName: "do-thing",
            toolInput: {
              id: {
                type: "jmespath",
                expression: "input.userId",
              },
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

    const result = await compileWorkflow(workflow);
    expect(errors(result.diagnostics)).toHaveLength(0);
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_ROOT_REFERENCE"),
    ).toBe(false);
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_FORWARD_REFERENCE"),
    ).toBe(false);
  });

  test("references to 'input' alias are invalid when no inputSchema", async () => {
    const workflow = {
      initialStepId: "entry",
      steps: [
        {
          id: "entry",
          name: "Entry",
          description: "Entry point",
          type: "start",
          nextStepId: "fetch_user",
        },
        {
          id: "fetch_user",
          name: "Fetch User",
          description: "Fetch user data",
          type: "tool-call",
          params: {
            toolName: "do-thing",
            toolInput: {
              id: {
                type: "jmespath",
                expression: "input.userId",
              },
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

    const result = await compileWorkflow(workflow);
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_ROOT_REFERENCE"),
    ).toBe(true);
  });
});

// ─── Workflow Output Validation ──────────────────────────────────

describe("workflow output", () => {
  test("valid jmespath in end step output expression", async () => {
    const workflow = {
      initialStepId: "fetch",
      outputSchema: { type: "object" },
      steps: [
        {
          id: "fetch",
          name: "Fetch",
          description: "Fetch data",
          type: "tool-call",
          params: {
            toolName: "get-data",
            toolInput: {},
          },
          nextStepId: "done",
        },
        {
          id: "done",
          name: "Done",
          description: "End",
          type: "end",
          params: {
            output: {
              type: "jmespath",
              expression: "fetch.result",
            },
          },
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow);
    expect(errors(result.diagnostics)).toHaveLength(0);
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_ROOT_REFERENCE"),
    ).toBe(false);
  });

  test("invalid jmespath root in end step output expression", async () => {
    const workflow = {
      initialStepId: "fetch",
      outputSchema: { type: "object" },
      steps: [
        {
          id: "fetch",
          name: "Fetch",
          description: "Fetch data",
          type: "tool-call",
          params: {
            toolName: "get-data",
            toolInput: {},
          },
          nextStepId: "done",
        },
        {
          id: "done",
          name: "Done",
          description: "End",
          type: "end",
          params: {
            output: {
              type: "jmespath",
              expression: "nonexistent.data",
            },
          },
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow);
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_ROOT_REFERENCE"),
    ).toBe(true);
    const diag = getFirstDiagnostic(
      result.diagnostics,
      "JMESPATH_INVALID_ROOT_REFERENCE",
    );
    expect(diag.location.stepId).toBe("done");
  });

  test("literal output expression is not jmespath-checked", async () => {
    const workflow = {
      initialStepId: "fetch",
      outputSchema: { type: "object" },
      steps: [
        {
          id: "fetch",
          name: "Fetch",
          description: "Fetch data",
          type: "tool-call",
          params: {
            toolName: "get-data",
            toolInput: {},
          },
          nextStepId: "done",
        },
        {
          id: "done",
          name: "Done",
          description: "End",
          type: "end",
          params: {
            output: { type: "literal", value: { key: "value" } },
          },
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow);
    expect(errors(result.diagnostics)).toHaveLength(0);
  });

  test("END_STEP_MISSING_OUTPUT error when outputSchema defined", async () => {
    const workflow = {
      initialStepId: "fetch",
      outputSchema: { type: "object" },
      steps: [
        {
          id: "fetch",
          name: "Fetch",
          description: "Fetch data",
          type: "tool-call",
          params: {
            toolName: "get-data",
            toolInput: {},
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

    const result = await compileWorkflow(workflow);
    expect(hasDiagnostic(result.diagnostics, "END_STEP_MISSING_OUTPUT")).toBe(
      true,
    );
    const diag = getFirstDiagnostic(
      result.diagnostics,
      "END_STEP_MISSING_OUTPUT",
    );
    expect(diag.severity).toBe("error");
    expect(diag.location.stepId).toBe("done");
  });

  test("END_STEP_UNEXPECTED_OUTPUT warning when no outputSchema", async () => {
    const workflow = {
      initialStepId: "fetch",
      steps: [
        {
          id: "fetch",
          name: "Fetch",
          description: "Fetch data",
          type: "tool-call",
          params: {
            toolName: "get-data",
            toolInput: {},
          },
          nextStepId: "done",
        },
        {
          id: "done",
          name: "Done",
          description: "End",
          type: "end",
          params: {
            output: { type: "literal", value: "hello" },
          },
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow);
    expect(
      hasDiagnostic(result.diagnostics, "END_STEP_UNEXPECTED_OUTPUT"),
    ).toBe(true);
    const diag = getFirstDiagnostic(
      result.diagnostics,
      "END_STEP_UNEXPECTED_OUTPUT",
    );
    expect(diag.severity).toBe("warning");
  });

  test("no warnings when outputSchema and output expressions are consistent", async () => {
    const workflow = {
      initialStepId: "fetch",
      outputSchema: { type: "object" },
      steps: [
        {
          id: "fetch",
          name: "Fetch",
          description: "Fetch data",
          type: "tool-call",
          params: {
            toolName: "get-data",
            toolInput: {},
          },
          nextStepId: "done",
        },
        {
          id: "done",
          name: "Done",
          description: "End",
          type: "end",
          params: {
            output: { type: "jmespath", expression: "fetch" },
          },
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow);
    expect(errors(result.diagnostics)).toHaveLength(0);
    expect(hasDiagnostic(result.diagnostics, "END_STEP_MISSING_OUTPUT")).toBe(
      false,
    );
    expect(
      hasDiagnostic(result.diagnostics, "END_STEP_UNEXPECTED_OUTPUT"),
    ).toBe(false);
  });

  test("no warnings when no outputSchema and no output expressions", async () => {
    const workflow = {
      initialStepId: "fetch",
      steps: [
        {
          id: "fetch",
          name: "Fetch",
          description: "Fetch data",
          type: "tool-call",
          params: {
            toolName: "get-data",
            toolInput: {},
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

    const result = await compileWorkflow(workflow);
    expect(hasDiagnostic(result.diagnostics, "END_STEP_MISSING_OUTPUT")).toBe(
      false,
    );
    expect(
      hasDiagnostic(result.diagnostics, "END_STEP_UNEXPECTED_OUTPUT"),
    ).toBe(false);
  });
  test("PATH_MISSING_END_STEP error when terminal step is not an end step", async () => {
    const workflow = {
      initialStepId: "fetch",
      outputSchema: { type: "object" },
      steps: [
        {
          id: "fetch",
          name: "Fetch",
          description: "Fetch data",
          type: "tool-call",
          params: {
            toolName: "get-data",
            toolInput: {},
          },
          // no nextStepId — terminal non-end step
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow);
    expect(hasDiagnostic(result.diagnostics, "PATH_MISSING_END_STEP")).toBe(
      true,
    );
    const diag = getFirstDiagnostic(
      result.diagnostics,
      "PATH_MISSING_END_STEP",
    );
    expect(diag.severity).toBe("error");
    expect(diag.location.stepId).toBe("fetch");
  });

  test("no PATH_MISSING_END_STEP when no outputSchema", async () => {
    const workflow = {
      initialStepId: "fetch",
      steps: [
        {
          id: "fetch",
          name: "Fetch",
          description: "Fetch data",
          type: "tool-call",
          params: {
            toolName: "get-data",
            toolInput: {},
          },
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow);
    expect(hasDiagnostic(result.diagnostics, "PATH_MISSING_END_STEP")).toBe(
      false,
    );
  });

  test("PATH_MISSING_END_STEP in switch-case branch when terminal", async () => {
    const workflow = {
      initialStepId: "branch",
      outputSchema: { type: "object" },
      steps: [
        {
          id: "branch",
          name: "Branch",
          description: "Branch",
          type: "switch-case",
          params: {
            switchOn: { type: "literal", value: "a" },
            cases: [
              {
                value: { type: "literal", value: "a" },
                branchBodyStepId: "case_a",
              },
              {
                value: { type: "literal", value: "b" },
                branchBodyStepId: "case_b",
              },
            ],
          },
          // no nextStepId — terminal switch-case
        },
        {
          id: "case_a",
          name: "Case A",
          description: "A",
          type: "end",
          params: {
            output: { type: "literal", value: { result: "a" } },
          },
        },
        {
          id: "case_b",
          name: "Case B",
          description: "B",
          type: "tool-call",
          params: {
            toolName: "some-tool",
            toolInput: {},
          },
          // no nextStepId — terminal non-end step in branch
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow);
    expect(hasDiagnostic(result.diagnostics, "PATH_MISSING_END_STEP")).toBe(
      true,
    );
    const diag = getFirstDiagnostic(
      result.diagnostics,
      "PATH_MISSING_END_STEP",
    );
    expect(diag.location.stepId).toBe("case_b");
  });

  test("PATH_MISSING_END_STEP in for-each loop body when terminal", async () => {
    const workflow = {
      initialStepId: "loop",
      outputSchema: { type: "array" },
      steps: [
        {
          id: "loop",
          name: "Loop",
          description: "Loop",
          type: "for-each",
          params: {
            target: { type: "literal", value: [1, 2, 3] },
            itemName: "item",
            loopBodyStepId: "process",
          },
          // no nextStepId — terminal for-each
        },
        {
          id: "process",
          name: "Process",
          description: "Process",
          type: "tool-call",
          params: {
            toolName: "some-tool",
            toolInput: {},
          },
          // no nextStepId — terminal non-end step in loop body
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow);
    expect(hasDiagnostic(result.diagnostics, "PATH_MISSING_END_STEP")).toBe(
      true,
    );
    const diag = getFirstDiagnostic(
      result.diagnostics,
      "PATH_MISSING_END_STEP",
    );
    expect(diag.location.stepId).toBe("process");
  });

  test("LITERAL_OUTPUT_SHAPE_MISMATCH when literal type mismatches outputSchema", async () => {
    const workflow = {
      initialStepId: "done",
      outputSchema: { type: "object" },
      steps: [
        {
          id: "done",
          name: "Done",
          description: "End",
          type: "end",
          params: {
            output: { type: "literal", value: "not an object" },
          },
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow);
    expect(
      hasDiagnostic(result.diagnostics, "LITERAL_OUTPUT_SHAPE_MISMATCH"),
    ).toBe(true);
    const diag = getFirstDiagnostic(
      result.diagnostics,
      "LITERAL_OUTPUT_SHAPE_MISMATCH",
    );
    expect(diag.severity).toBe("error");
    expect(diag.message).toContain("string");
    expect(diag.message).toContain("object");
  });

  test("LITERAL_OUTPUT_SHAPE_MISMATCH for missing required fields", async () => {
    const workflow = {
      initialStepId: "done",
      outputSchema: {
        type: "object",
        required: ["name", "email"],
        properties: {
          name: { type: "string" },
          email: { type: "string" },
        },
      },
      steps: [
        {
          id: "done",
          name: "Done",
          description: "End",
          type: "end",
          params: {
            output: {
              type: "literal",
              value: { name: "Alice" },
            },
          },
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow);
    expect(
      hasDiagnostic(result.diagnostics, "LITERAL_OUTPUT_SHAPE_MISMATCH"),
    ).toBe(true);
    const diag = getFirstDiagnostic(
      result.diagnostics,
      "LITERAL_OUTPUT_SHAPE_MISMATCH",
    );
    expect(diag.message).toContain("email");
  });

  test("LITERAL_OUTPUT_SHAPE_MISMATCH for wrong property type", async () => {
    const workflow = {
      initialStepId: "done",
      outputSchema: {
        type: "object",
        properties: {
          count: { type: "number" },
        },
      },
      steps: [
        {
          id: "done",
          name: "Done",
          description: "End",
          type: "end",
          params: {
            output: {
              type: "literal",
              value: { count: "not a number" },
            },
          },
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow);
    expect(
      hasDiagnostic(result.diagnostics, "LITERAL_OUTPUT_SHAPE_MISMATCH"),
    ).toBe(true);
    const diag = getFirstDiagnostic(
      result.diagnostics,
      "LITERAL_OUTPUT_SHAPE_MISMATCH",
    );
    expect(diag.message).toContain("count");
    expect(diag.message).toContain("string");
    expect(diag.message).toContain("number");
  });

  test("no LITERAL_OUTPUT_SHAPE_MISMATCH when literal matches schema", async () => {
    const workflow = {
      initialStepId: "done",
      outputSchema: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
          count: { type: "number" },
        },
      },
      steps: [
        {
          id: "done",
          name: "Done",
          description: "End",
          type: "end",
          params: {
            output: {
              type: "literal",
              value: { name: "Alice", count: 42 },
            },
          },
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow);
    expect(
      hasDiagnostic(result.diagnostics, "LITERAL_OUTPUT_SHAPE_MISMATCH"),
    ).toBe(false);
  });

  test("no LITERAL_OUTPUT_SHAPE_MISMATCH for jmespath when tool schemas unavailable", async () => {
    const workflow = {
      initialStepId: "fetch",
      outputSchema: { type: "object" },
      steps: [
        {
          id: "fetch",
          name: "Fetch",
          description: "Fetch data",
          type: "tool-call",
          params: {
            toolName: "get-data",
            toolInput: {},
          },
          nextStepId: "done",
        },
        {
          id: "done",
          name: "Done",
          description: "End",
          type: "end",
          params: {
            output: { type: "jmespath", expression: "fetch" },
          },
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow);
    expect(
      hasDiagnostic(result.diagnostics, "LITERAL_OUTPUT_SHAPE_MISMATCH"),
    ).toBe(false);
  });

  test("END_STEP_MISSING_OUTPUT in switch-case branch end steps when terminal", async () => {
    const workflow = {
      initialStepId: "branch",
      outputSchema: { type: "object" },
      steps: [
        {
          id: "branch",
          name: "Branch",
          description: "Branch",
          type: "switch-case",
          params: {
            switchOn: { type: "literal", value: "a" },
            cases: [
              {
                value: { type: "literal", value: "a" },
                branchBodyStepId: "case_a_end",
              },
              {
                value: { type: "literal", value: "b" },
                branchBodyStepId: "case_b_end",
              },
            ],
          },
        },
        {
          id: "case_a_end",
          name: "Case A End",
          description: "End A",
          type: "end",
          params: {
            output: { type: "literal", value: { result: "a" } },
          },
        },
        {
          id: "case_b_end",
          name: "Case B End",
          description: "End B",
          type: "end",
          // no output expression
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow);
    expect(hasDiagnostic(result.diagnostics, "END_STEP_MISSING_OUTPUT")).toBe(
      true,
    );
    const diag = getFirstDiagnostic(
      result.diagnostics,
      "END_STEP_MISSING_OUTPUT",
    );
    expect(diag.location.stepId).toBe("case_b_end");
  });

  test("LITERAL_OUTPUT_SHAPE_MISMATCH for jmespath resolving to wrong type via tool outputSchema", async () => {
    const tools = {
      "get-name": tool({
        inputSchema: type({}),
        outputSchema: type({ name: "string" }),
        execute: async () => ({ name: "Alice" }),
      }),
    };

    const workflow = {
      initialStepId: "fetch",
      outputSchema: { type: "array" },
      steps: [
        {
          id: "fetch",
          name: "Fetch",
          description: "Get name",
          type: "tool-call",
          params: { toolName: "get-name", toolInput: {} },
          nextStepId: "done",
        },
        {
          id: "done",
          name: "Done",
          description: "End",
          type: "end",
          params: {
            output: { type: "jmespath", expression: "fetch" },
          },
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow, { tools });
    expect(
      hasDiagnostic(result.diagnostics, "LITERAL_OUTPUT_SHAPE_MISMATCH"),
    ).toBe(true);
    const diag = getFirstDiagnostic(
      result.diagnostics,
      "LITERAL_OUTPUT_SHAPE_MISMATCH",
    );
    expect(diag.severity).toBe("error");
    expect(diag.message).toContain("object");
    expect(diag.message).toContain("array");
  });

  test("LITERAL_OUTPUT_SHAPE_MISMATCH for jmespath missing required fields from tool schema", async () => {
    const tools = {
      "get-user": tool({
        inputSchema: type({}),
        outputSchema: type({ name: "string" }),
        execute: async () => ({ name: "Alice" }),
      }),
    };

    const workflow = {
      initialStepId: "fetch",
      outputSchema: {
        type: "object",
        required: ["name", "email"],
        properties: {
          name: { type: "string" },
          email: { type: "string" },
        },
      },
      steps: [
        {
          id: "fetch",
          name: "Fetch",
          description: "Get user",
          type: "tool-call",
          params: { toolName: "get-user", toolInput: {} },
          nextStepId: "done",
        },
        {
          id: "done",
          name: "Done",
          description: "End",
          type: "end",
          params: {
            output: { type: "jmespath", expression: "fetch" },
          },
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow, { tools });
    expect(
      hasDiagnostic(result.diagnostics, "LITERAL_OUTPUT_SHAPE_MISMATCH"),
    ).toBe(true);
    const diag = getFirstDiagnostic(
      result.diagnostics,
      "LITERAL_OUTPUT_SHAPE_MISMATCH",
    );
    expect(diag.message).toContain("email");
  });

  test("LITERAL_OUTPUT_SHAPE_MISMATCH for jmespath property type mismatch", async () => {
    const tools = {
      "get-data": tool({
        inputSchema: type({}),
        outputSchema: type({ count: "string" }),
        execute: async () => ({ count: "5" }),
      }),
    };

    const workflow = {
      initialStepId: "fetch",
      outputSchema: {
        type: "object",
        properties: {
          count: { type: "number" },
        },
      },
      steps: [
        {
          id: "fetch",
          name: "Fetch",
          description: "Get data",
          type: "tool-call",
          params: { toolName: "get-data", toolInput: {} },
          nextStepId: "done",
        },
        {
          id: "done",
          name: "Done",
          description: "End",
          type: "end",
          params: {
            output: { type: "jmespath", expression: "fetch" },
          },
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow, { tools });
    expect(
      hasDiagnostic(result.diagnostics, "LITERAL_OUTPUT_SHAPE_MISMATCH"),
    ).toBe(true);
    const diag = getFirstDiagnostic(
      result.diagnostics,
      "LITERAL_OUTPUT_SHAPE_MISMATCH",
    );
    expect(diag.message).toContain("count");
    expect(diag.message).toContain("string");
    expect(diag.message).toContain("number");
  });

  test("no shape error for jmespath when tool schema matches outputSchema", async () => {
    const tools = {
      "get-user": tool({
        inputSchema: type({}),
        outputSchema: type({ name: "string", email: "string" }),
        execute: async () => ({ name: "Alice", email: "a@b.c" }),
      }),
    };

    const workflow = {
      initialStepId: "fetch",
      outputSchema: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
          email: { type: "string" },
        },
      },
      steps: [
        {
          id: "fetch",
          name: "Fetch",
          description: "Get user",
          type: "tool-call",
          params: { toolName: "get-user", toolInput: {} },
          nextStepId: "done",
        },
        {
          id: "done",
          name: "Done",
          description: "End",
          type: "end",
          params: {
            output: { type: "jmespath", expression: "fetch" },
          },
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow, { tools });
    expect(
      hasDiagnostic(result.diagnostics, "LITERAL_OUTPUT_SHAPE_MISMATCH"),
    ).toBe(false);
  });

  test("jmespath shape validation resolves dotted paths through tool schema", async () => {
    const tools = {
      "get-data": tool({
        inputSchema: type({}),
        outputSchema: type({
          user: { name: "string", age: "number" },
        }),
        execute: async () => ({ user: { name: "Alice", age: 30 } }),
      }),
    };

    const workflow = {
      initialStepId: "fetch",
      outputSchema: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
          age: { type: "number" },
        },
      },
      steps: [
        {
          id: "fetch",
          name: "Fetch",
          description: "Get data",
          type: "tool-call",
          params: { toolName: "get-data", toolInput: {} },
          nextStepId: "done",
        },
        {
          id: "done",
          name: "Done",
          description: "End",
          type: "end",
          params: {
            output: {
              type: "jmespath",
              expression: "fetch.user",
            },
          },
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow, { tools });
    expect(
      hasDiagnostic(result.diagnostics, "LITERAL_OUTPUT_SHAPE_MISMATCH"),
    ).toBe(false);
  });

  test("jmespath shape validation works with llm-prompt outputFormat", async () => {
    const workflow = {
      initialStepId: "analyze",
      outputSchema: { type: "array" },
      steps: [
        {
          id: "analyze",
          name: "Analyze",
          description: "Analyze data",
          type: "llm-prompt",
          params: {
            prompt: "Analyze this data",
            outputFormat: {
              type: "object",
              properties: {
                summary: { type: "string" },
              },
            },
          },
          nextStepId: "done",
        },
        {
          id: "done",
          name: "Done",
          description: "End",
          type: "end",
          params: {
            output: { type: "jmespath", expression: "analyze" },
          },
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow);
    expect(
      hasDiagnostic(result.diagnostics, "LITERAL_OUTPUT_SHAPE_MISMATCH"),
    ).toBe(true);
    const diag = getFirstDiagnostic(
      result.diagnostics,
      "LITERAL_OUTPUT_SHAPE_MISMATCH",
    );
    expect(diag.message).toContain("object");
    expect(diag.message).toContain("array");
  });

  test("jmespath shape validation works with extract-data outputFormat", async () => {
    const workflow = {
      initialStepId: "extract",
      outputSchema: {
        type: "object",
        properties: {
          items: { type: "array" },
        },
      },
      steps: [
        {
          id: "extract",
          name: "Extract",
          description: "Extract data",
          type: "extract-data",
          params: {
            sourceData: { type: "literal", value: "raw text" },
            outputFormat: {
              type: "object",
              properties: {
                items: { type: "array" },
              },
            },
          },
          nextStepId: "done",
        },
        {
          id: "done",
          name: "Done",
          description: "End",
          type: "end",
          params: {
            output: { type: "jmespath", expression: "extract" },
          },
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow);
    expect(
      hasDiagnostic(result.diagnostics, "LITERAL_OUTPUT_SHAPE_MISMATCH"),
    ).toBe(false);
  });

  test("jmespath shape validation skips complex expressions gracefully", async () => {
    const tools = {
      "get-data": tool({
        inputSchema: type({}),
        outputSchema: type({ items: [{ id: "string" }, "[]"] }),
        execute: async () => ({ items: [] }),
      }),
    };

    const workflow = {
      initialStepId: "fetch",
      outputSchema: { type: "array" },
      steps: [
        {
          id: "fetch",
          name: "Fetch",
          description: "Get data",
          type: "tool-call",
          params: { toolName: "get-data", toolInput: {} },
          nextStepId: "done",
        },
        {
          id: "done",
          name: "Done",
          description: "End",
          type: "end",
          params: {
            output: {
              type: "jmespath",
              expression: "fetch.items[?id == 'active']",
            },
          },
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow, { tools });
    // Complex JMESPath expressions can't be resolved, so no shape error
    expect(
      hasDiagnostic(result.diagnostics, "LITERAL_OUTPUT_SHAPE_MISMATCH"),
    ).toBe(false);
  });

  test("jmespath shape validation without tools still works for llm-prompt", async () => {
    const workflow = {
      initialStepId: "analyze",
      outputSchema: {
        type: "object",
        properties: { result: { type: "string" } },
      },
      steps: [
        {
          id: "analyze",
          name: "Analyze",
          description: "Analyze",
          type: "llm-prompt",
          params: {
            prompt: "Analyze",
            outputFormat: {
              type: "object",
              properties: { result: { type: "string" } },
            },
          },
          nextStepId: "done",
        },
        {
          id: "done",
          name: "Done",
          description: "End",
          type: "end",
          params: {
            output: { type: "jmespath", expression: "analyze" },
          },
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow);
    expect(
      hasDiagnostic(result.diagnostics, "LITERAL_OUTPUT_SHAPE_MISMATCH"),
    ).toBe(false);
  });

  test("jmespath referencing input schema validates against outputSchema", async () => {
    const workflow = {
      initialStepId: "done",
      inputSchema: {
        type: "object",
        properties: {
          data: {
            type: "object",
            properties: {
              name: { type: "string" },
            },
          },
        },
      },
      outputSchema: { type: "array" },
      steps: [
        {
          id: "done",
          name: "Done",
          description: "End",
          type: "end",
          params: {
            output: { type: "jmespath", expression: "input.data" },
          },
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow);
    expect(
      hasDiagnostic(result.diagnostics, "LITERAL_OUTPUT_SHAPE_MISMATCH"),
    ).toBe(true);
    const diag = getFirstDiagnostic(
      result.diagnostics,
      "LITERAL_OUTPUT_SHAPE_MISMATCH",
    );
    expect(diag.message).toContain("object");
    expect(diag.message).toContain("array");
  });
});

// ─── For-each target type validation ────────────────────────────

describe("for-each target type validation", () => {
  test("error when for-each target resolves to object instead of array", async () => {
    const tools = {
      "get-orders": tool({
        inputSchema: type({}),
        outputSchema: type({
          orders: [{ id: "string" }, "[]"],
        }),
        execute: async () => ({ orders: [] }),
      }),
    };

    const workflow: WorkflowDefinition = {
      initialStepId: "fetch",
      steps: [
        {
          id: "fetch",
          name: "Fetch",
          description: "Get orders",
          type: "tool-call",
          params: { toolName: "get-orders", toolInput: {} },
          nextStepId: "loop",
        },
        {
          id: "loop",
          name: "Loop",
          description: "Process each order",
          type: "for-each",
          params: {
            target: { type: "jmespath", expression: "fetch" },
            itemName: "order",
            loopBodyStepId: "process",
          },
          nextStepId: "done",
        },
        {
          id: "process",
          name: "Process",
          description: "Process order",
          type: "tool-call",
          params: { toolName: "get-orders", toolInput: {} },
        },
        {
          id: "done",
          name: "Done",
          description: "End",
          type: "end",
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow, { tools });
    expect(hasDiagnostic(result.diagnostics, "FOREACH_TARGET_NOT_ARRAY")).toBe(
      true,
    );

    const diag = getFirstDiagnostic(
      result.diagnostics,
      "FOREACH_TARGET_NOT_ARRAY",
    );
    expect(diag.message).toContain("fetch");
    expect(diag.message).toContain("object");
    expect(diag.message).toContain("fetch.orders");
  });

  test("no error when for-each target resolves to array via dotted path", async () => {
    const tools = {
      "get-orders": tool({
        inputSchema: type({}),
        outputSchema: type({
          orders: [{ id: "string" }, "[]"],
        }),
        execute: async () => ({ orders: [] }),
      }),
    };

    const workflow: WorkflowDefinition = {
      initialStepId: "fetch",
      steps: [
        {
          id: "fetch",
          name: "Fetch",
          description: "Get orders",
          type: "tool-call",
          params: { toolName: "get-orders", toolInput: {} },
          nextStepId: "loop",
        },
        {
          id: "loop",
          name: "Loop",
          description: "Process each order",
          type: "for-each",
          params: {
            target: {
              type: "jmespath",
              expression: "fetch.orders",
            },
            itemName: "order",
            loopBodyStepId: "process",
          },
          nextStepId: "done",
        },
        {
          id: "process",
          name: "Process",
          description: "Process order",
          type: "tool-call",
          params: { toolName: "get-orders", toolInput: {} },
        },
        {
          id: "done",
          name: "Done",
          description: "End",
          type: "end",
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow, { tools });
    expect(hasDiagnostic(result.diagnostics, "FOREACH_TARGET_NOT_ARRAY")).toBe(
      false,
    );
  });

  test("no error when tool output is directly an array", async () => {
    const tools = {
      "get-items": tool({
        inputSchema: type({}),
        outputSchema: type([{ id: "string" }, "[]"]),
        execute: async () => [],
      }),
    };

    const workflow: WorkflowDefinition = {
      initialStepId: "fetch",
      steps: [
        {
          id: "fetch",
          name: "Fetch",
          description: "Get items",
          type: "tool-call",
          params: { toolName: "get-items", toolInput: {} },
          nextStepId: "loop",
        },
        {
          id: "loop",
          name: "Loop",
          description: "Process items",
          type: "for-each",
          params: {
            target: { type: "jmespath", expression: "fetch" },
            itemName: "item",
            loopBodyStepId: "process",
          },
          nextStepId: "done",
        },
        {
          id: "process",
          name: "Process",
          description: "Process item",
          type: "tool-call",
          params: { toolName: "get-items", toolInput: {} },
        },
        {
          id: "done",
          name: "Done",
          description: "End",
          type: "end",
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow, { tools });
    expect(hasDiagnostic(result.diagnostics, "FOREACH_TARGET_NOT_ARRAY")).toBe(
      false,
    );
  });

  test("skips validation for complex JMESPath expressions", async () => {
    const tools = {
      "get-data": tool({
        inputSchema: type({}),
        outputSchema: type({ items: [{ id: "string" }, "[]"] }),
        execute: async () => ({ items: [] }),
      }),
    };

    const workflow: WorkflowDefinition = {
      initialStepId: "fetch",
      steps: [
        {
          id: "fetch",
          name: "Fetch",
          description: "Get data",
          type: "tool-call",
          params: { toolName: "get-data", toolInput: {} },
          nextStepId: "loop",
        },
        {
          id: "loop",
          name: "Loop",
          description: "Process items",
          type: "for-each",
          params: {
            target: {
              type: "jmespath",
              expression: "fetch.items[?id == 'active']",
            },
            itemName: "item",
            loopBodyStepId: "process",
          },
          nextStepId: "done",
        },
        {
          id: "process",
          name: "Process",
          description: "Process item",
          type: "tool-call",
          params: { toolName: "get-data", toolInput: {} },
        },
        {
          id: "done",
          name: "Done",
          description: "End",
          type: "end",
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow, { tools });
    expect(hasDiagnostic(result.diagnostics, "FOREACH_TARGET_NOT_ARRAY")).toBe(
      false,
    );
  });
});

// ─── Compiler Limits Tests ──────────────────────────────────────

describe("compiler limits", () => {
  const tools = testTools;

  const sleepWorkflow = (durationMs: number): WorkflowDefinition =>
    ({
      initialStepId: "sleep_step",
      steps: [
        {
          id: "sleep_step",
          name: "Sleep",
          description: "sleep",
          type: "sleep",
          params: {
            durationMs: { type: "literal", value: durationMs },
          },
          nextStepId: "end_step",
        },
        {
          id: "end_step",
          name: "End",
          description: "end",
          type: "end",
        },
      ],
    }) as WorkflowDefinition;

  const waitWorkflow = (overrides: {
    maxAttempts?: number;
    intervalMs?: number;
    backoffMultiplier?: number;
    timeoutMs?: number;
  }): WorkflowDefinition =>
    ({
      initialStepId: "wait_step",
      steps: [
        {
          id: "check_step",
          name: "Check",
          description: "check",
          type: "tool-call",
          params: {
            toolName: "do-thing",
            toolInput: {},
          },
        },
        {
          id: "wait_step",
          name: "Wait",
          description: "wait",
          type: "wait-for-condition",
          params: {
            conditionStepId: "check_step",
            condition: {
              type: "jmespath",
              expression: "check_step.ready",
            },
            ...(overrides.maxAttempts !== undefined && {
              maxAttempts: {
                type: "literal",
                value: overrides.maxAttempts,
              },
            }),
            ...(overrides.intervalMs !== undefined && {
              intervalMs: {
                type: "literal",
                value: overrides.intervalMs,
              },
            }),
            ...(overrides.backoffMultiplier !== undefined && {
              backoffMultiplier: {
                type: "literal",
                value: overrides.backoffMultiplier,
              },
            }),
            ...(overrides.timeoutMs !== undefined && {
              timeoutMs: {
                type: "literal",
                value: overrides.timeoutMs,
              },
            }),
          },
          nextStepId: "end_step",
        },
        {
          id: "end_step",
          name: "End",
          description: "end",
          type: "end",
        },
      ],
    }) as WorkflowDefinition;

  test("sleep duration within default limit passes", async () => {
    const result = await compileWorkflow(sleepWorkflow(60_000), { tools });
    expect(
      hasDiagnostic(result.diagnostics, "SLEEP_DURATION_EXCEEDS_LIMIT"),
    ).toBe(false);
  });

  test("sleep duration exceeding default limit (5 min) errors", async () => {
    const result = await compileWorkflow(sleepWorkflow(600_000), { tools });
    expect(
      hasDiagnostic(result.diagnostics, "SLEEP_DURATION_EXCEEDS_LIMIT"),
    ).toBe(true);
  });

  test("sleep duration within custom limit passes", async () => {
    const result = await compileWorkflow(sleepWorkflow(900_000), {
      tools,
      limits: { maxSleepMs: 1_000_000 },
    });
    expect(
      hasDiagnostic(result.diagnostics, "SLEEP_DURATION_EXCEEDS_LIMIT"),
    ).toBe(false);
  });

  test("sleep duration exceeding custom limit errors", async () => {
    const result = await compileWorkflow(sleepWorkflow(200), {
      tools,
      limits: { maxSleepMs: 100 },
    });
    expect(
      hasDiagnostic(result.diagnostics, "SLEEP_DURATION_EXCEEDS_LIMIT"),
    ).toBe(true);
    const diag = getFirstDiagnostic(
      result.diagnostics,
      "SLEEP_DURATION_EXCEEDS_LIMIT",
    );
    expect(diag.message).toContain("200ms");
    expect(diag.message).toContain("100ms");
  });

  test("jmespath sleep duration is not validated (unknown at compile time)", async () => {
    const workflow = {
      initialStepId: "sleep_step",
      steps: [
        {
          id: "sleep_step",
          name: "Sleep",
          description: "sleep",
          type: "sleep",
          params: {
            durationMs: { type: "jmespath", expression: "input.duration" },
          },
          nextStepId: "end_step",
        },
        {
          id: "end_step",
          name: "End",
          description: "end",
          type: "end",
        },
      ],
    } as WorkflowDefinition;
    const result = await compileWorkflow(workflow, {
      tools,
      limits: { maxSleepMs: 1 },
    });
    expect(
      hasDiagnostic(result.diagnostics, "SLEEP_DURATION_EXCEEDS_LIMIT"),
    ).toBe(false);
  });

  test("maxAttempts exceeding limit errors", async () => {
    const result = await compileWorkflow(waitWorkflow({ maxAttempts: 200 }), {
      tools,
      limits: { maxAttempts: 100 },
    });
    expect(
      hasDiagnostic(result.diagnostics, "WAIT_ATTEMPTS_EXCEEDS_LIMIT"),
    ).toBe(true);
  });

  test("maxAttempts within default unlimited passes", async () => {
    const result = await compileWorkflow(
      waitWorkflow({ maxAttempts: 10_000 }),
      { tools },
    );
    expect(
      hasDiagnostic(result.diagnostics, "WAIT_ATTEMPTS_EXCEEDS_LIMIT"),
    ).toBe(false);
  });

  test("intervalMs exceeding limit errors", async () => {
    const result = await compileWorkflow(
      waitWorkflow({ intervalMs: 400_000 }),
      { tools },
    );
    expect(
      hasDiagnostic(result.diagnostics, "WAIT_INTERVAL_EXCEEDS_LIMIT"),
    ).toBe(true);
  });

  test("backoffMultiplier below range errors", async () => {
    const result = await compileWorkflow(
      waitWorkflow({ backoffMultiplier: 0.5 }),
      { tools },
    );
    expect(
      hasDiagnostic(result.diagnostics, "BACKOFF_MULTIPLIER_OUT_OF_RANGE"),
    ).toBe(true);
  });

  test("backoffMultiplier above range errors", async () => {
    const result = await compileWorkflow(
      waitWorkflow({ backoffMultiplier: 3 }),
      { tools },
    );
    expect(
      hasDiagnostic(result.diagnostics, "BACKOFF_MULTIPLIER_OUT_OF_RANGE"),
    ).toBe(true);
  });

  test("backoffMultiplier within range passes", async () => {
    const result = await compileWorkflow(
      waitWorkflow({ backoffMultiplier: 1.5 }),
      { tools },
    );
    expect(
      hasDiagnostic(result.diagnostics, "BACKOFF_MULTIPLIER_OUT_OF_RANGE"),
    ).toBe(false);
  });

  test("timeoutMs exceeding limit errors", async () => {
    const result = await compileWorkflow(waitWorkflow({ timeoutMs: 700_000 }), {
      tools,
    });
    expect(
      hasDiagnostic(result.diagnostics, "WAIT_TIMEOUT_EXCEEDS_LIMIT"),
    ).toBe(true);
  });

  test("timeoutMs within limit passes", async () => {
    const result = await compileWorkflow(waitWorkflow({ timeoutMs: 500_000 }), {
      tools,
    });
    expect(
      hasDiagnostic(result.diagnostics, "WAIT_TIMEOUT_EXCEEDS_LIMIT"),
    ).toBe(false);
  });

  test("custom backoff range", async () => {
    const result = await compileWorkflow(
      waitWorkflow({ backoffMultiplier: 1.5 }),
      { tools, limits: { minBackoffMultiplier: 1, maxBackoffMultiplier: 1.2 } },
    );
    expect(
      hasDiagnostic(result.diagnostics, "BACKOFF_MULTIPLIER_OUT_OF_RANGE"),
    ).toBe(true);
  });
});

// ─── Agent Loop ──────────────────────────────────────────────────

describe("agent-loop", () => {
  test("valid agent-loop step compiles without errors", async () => {
    const workflow = makeWorkflow({
      initialStepId: "start_step",
      steps: [
        {
          id: "start_step",
          name: "Start",
          description: "Start",
          type: "start",
          nextStepId: "agent_step",
        },
        {
          id: "agent_step",
          name: "Agent",
          description: "Run agent",
          type: "agent-loop",
          params: {
            instructions: "Do something with the tool.",
            tools: ["do-thing"],
            outputFormat: {
              type: "object",
              properties: { result: { type: "string" } },
            },
          },
          nextStepId: "end_step",
        },
        {
          id: "end_step",
          name: "End",
          description: "End",
          type: "end",
        },
      ] as WorkflowDefinition["steps"],
    });

    const result = await compileWorkflow(workflow, { tools: testTools });
    expect(errors(result.diagnostics)).toHaveLength(0);
  });

  test("agent-loop with unknown tool produces UNKNOWN_TOOL diagnostic", async () => {
    const workflow = makeWorkflow({
      initialStepId: "agent_step",
      steps: [
        {
          id: "agent_step",
          name: "Agent",
          description: "Run agent",
          type: "agent-loop",
          params: {
            instructions: "Do something.",
            tools: ["nonexistent_tool"],
            outputFormat: { type: "object" },
          },
        },
      ] as WorkflowDefinition["steps"],
    });

    const result = await compileWorkflow(workflow, { tools: testTools });
    expect(hasDiagnostic(result.diagnostics, "UNKNOWN_TOOL")).toBe(true);
    const diag = getFirstDiagnostic(result.diagnostics, "UNKNOWN_TOOL");
    expect(diag.location.stepId).toBe("agent_step");
  });

  test("agent-loop template expressions are validated", async () => {
    const workflow = makeWorkflow({
      initialStepId: "agent_step",
      steps: [
        {
          id: "agent_step",
          name: "Agent",
          description: "Run agent",
          type: "agent-loop",
          params: {
            instructions: "Process ${nonexistent_step.data}",
            tools: ["do-thing"],
            outputFormat: { type: "object" },
          },
        },
      ] as WorkflowDefinition["steps"],
    });

    const result = await compileWorkflow(workflow, { tools: testTools });
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_ROOT_REFERENCE"),
    ).toBe(true);
  });
});

// ─── Expression property path validation ────────────────────────

describe("expression property path validation", () => {
  test("no warning when property exists in tool outputSchema", async () => {
    const tools = {
      "get-data": tool({
        inputSchema: type({}),
        outputSchema: type({ summary: "string", count: "number" }),
        execute: async () => ({ summary: "ok", count: 1 }),
      }),
    };

    const workflow = makeWorkflow({
      initialStepId: "fetch",
      steps: [
        {
          id: "fetch",
          name: "Fetch",
          description: "Get data",
          type: "tool-call",
          params: { toolName: "get-data", toolInput: {} },
          nextStepId: "report",
        },
        {
          id: "report",
          name: "Report",
          description: "Format report",
          type: "llm-prompt",
          params: {
            prompt: "Summarize: ${fetch.summary}",
            outputFormat: { type: "object" },
          },
          nextStepId: "done",
        },
        { id: "done", name: "Done", description: "End", type: "end" },
      ] as WorkflowDefinition["steps"],
    });

    const result = await compileWorkflow(workflow, { tools });
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_PROPERTY_PATH"),
    ).toBe(false);
  });

  test("no warning when property exists in llm-prompt outputFormat", async () => {
    const workflow = makeWorkflow({
      initialStepId: "analyze",
      steps: [
        {
          id: "analyze",
          name: "Analyze",
          description: "Analyze data",
          type: "llm-prompt",
          params: {
            prompt: "Analyze this",
            outputFormat: {
              type: "object",
              properties: { result: { type: "string" } },
            },
          },
          nextStepId: "notify",
        },
        {
          id: "notify",
          name: "Notify",
          description: "Send notification",
          type: "tool-call",
          params: {
            toolName: "send-slack-message",
            toolInput: {
              channel: { type: "literal", value: "#general" },
              message: { type: "jmespath", expression: "analyze.result" },
            },
          },
          nextStepId: "done",
        },
        { id: "done", name: "Done", description: "End", type: "end" },
      ] as WorkflowDefinition["steps"],
    });

    const result = await compileWorkflow(workflow, { tools: testTools });
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_PROPERTY_PATH"),
    ).toBe(false);
  });

  test("warns on invalid property in tool outputSchema", async () => {
    const tools = {
      "get-data": tool({
        inputSchema: type({}),
        outputSchema: type({ result: "string" }),
        execute: async () => ({ result: "ok" }),
      }),
    };

    const workflow = makeWorkflow({
      initialStepId: "fetch",
      steps: [
        {
          id: "fetch",
          name: "Fetch",
          description: "Get data",
          type: "tool-call",
          params: { toolName: "get-data", toolInput: {} },
          nextStepId: "report",
        },
        {
          id: "report",
          name: "Report",
          description: "Format report",
          type: "llm-prompt",
          params: {
            prompt: "Data: ${fetch.data}",
            outputFormat: { type: "object" },
          },
          nextStepId: "done",
        },
        { id: "done", name: "Done", description: "End", type: "end" },
      ] as WorkflowDefinition["steps"],
    });

    const result = await compileWorkflow(workflow, { tools });
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_PROPERTY_PATH"),
    ).toBe(true);
    const diag = getFirstDiagnostic(
      result.diagnostics,
      "JMESPATH_INVALID_PROPERTY_PATH",
    );
    expect(diag.severity).toBe("error");
    expect(diag.message).toContain("data");
    expect(diag.message).toContain("result");
    expect(diag.location.stepId).toBe("report");
  });

  test("warns on invalid property in llm-prompt template expression", async () => {
    const workflow = makeWorkflow({
      initialStepId: "analyze",
      steps: [
        {
          id: "analyze",
          name: "Analyze",
          description: "Analyze data",
          type: "llm-prompt",
          params: {
            prompt: "Analyze this",
            outputFormat: {
              type: "object",
              properties: { summary: { type: "string" } },
            },
          },
          nextStepId: "format",
        },
        {
          id: "format",
          name: "Format",
          description: "Format output",
          type: "llm-prompt",
          params: {
            prompt: "Format: ${analyze.nonexistent}",
            outputFormat: { type: "object" },
          },
          nextStepId: "done",
        },
        { id: "done", name: "Done", description: "End", type: "end" },
      ] as WorkflowDefinition["steps"],
    });

    const result = await compileWorkflow(workflow);
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_PROPERTY_PATH"),
    ).toBe(true);
    const diag = getFirstDiagnostic(
      result.diagnostics,
      "JMESPATH_INVALID_PROPERTY_PATH",
    );
    expect(diag.message).toContain("nonexistent");
    expect(diag.message).toContain("summary");
  });

  test("warns on invalid property in agent-loop template expression", async () => {
    const workflow = makeWorkflow({
      initialStepId: "analyze",
      steps: [
        {
          id: "analyze",
          name: "Analyze",
          description: "Analyze",
          type: "llm-prompt",
          params: {
            prompt: "Analyze this",
            outputFormat: {
              type: "object",
              properties: { findings: { type: "string" } },
            },
          },
          nextStepId: "agent",
        },
        {
          id: "agent",
          name: "Agent",
          description: "Run agent",
          type: "agent-loop",
          params: {
            instructions: "Process ${analyze.wrong_field}",
            tools: ["do-thing"],
            outputFormat: { type: "object" },
          },
          nextStepId: "done",
        },
        { id: "done", name: "Done", description: "End", type: "end" },
      ] as WorkflowDefinition["steps"],
    });

    const result = await compileWorkflow(workflow, { tools: testTools });
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_PROPERTY_PATH"),
    ).toBe(true);
    const diag = getFirstDiagnostic(
      result.diagnostics,
      "JMESPATH_INVALID_PROPERTY_PATH",
    );
    expect(diag.message).toContain("wrong_field");
    expect(diag.message).toContain("findings");
  });

  test("warns on invalid property in switch-case switchOn expression", async () => {
    const workflow = makeWorkflow({
      initialStepId: "analyze",
      steps: [
        {
          id: "analyze",
          name: "Analyze",
          description: "Analyze",
          type: "llm-prompt",
          params: {
            prompt: "Classify this",
            outputFormat: {
              type: "object",
              properties: { category: { type: "string" } },
            },
          },
          nextStepId: "branch",
        },
        {
          id: "branch",
          name: "Branch",
          description: "Branch on category",
          type: "switch-case",
          params: {
            switchOn: {
              type: "jmespath",
              expression: "analyze.classification",
            },
            cases: [
              {
                value: { type: "literal", value: "critical" },
                branchBodyStepId: "done",
              },
            ],
          },
          nextStepId: "done",
        },
        { id: "done", name: "Done", description: "End", type: "end" },
      ] as WorkflowDefinition["steps"],
    });

    const result = await compileWorkflow(workflow);
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_PROPERTY_PATH"),
    ).toBe(true);
    const diag = getFirstDiagnostic(
      result.diagnostics,
      "JMESPATH_INVALID_PROPERTY_PATH",
    );
    expect(diag.message).toContain("classification");
    expect(diag.message).toContain("category");
  });

  test("warns on invalid property in end step output expression", async () => {
    const workflow = makeWorkflow({
      initialStepId: "analyze",
      steps: [
        {
          id: "analyze",
          name: "Analyze",
          description: "Analyze",
          type: "llm-prompt",
          params: {
            prompt: "Analyze this",
            outputFormat: {
              type: "object",
              properties: { summary: { type: "string" } },
            },
          },
          nextStepId: "done",
        },
        {
          id: "done",
          name: "Done",
          description: "End",
          type: "end",
          params: {
            output: { type: "jmespath", expression: "analyze.report" },
          },
        },
      ] as WorkflowDefinition["steps"],
    });

    const result = await compileWorkflow(workflow);
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_PROPERTY_PATH"),
    ).toBe(true);
    const diag = getFirstDiagnostic(
      result.diagnostics,
      "JMESPATH_INVALID_PROPERTY_PATH",
    );
    expect(diag.message).toContain("report");
  });

  test("warns on invalid property in extract-data sourceData expression", async () => {
    const workflow = makeWorkflow({
      initialStepId: "analyze",
      steps: [
        {
          id: "analyze",
          name: "Analyze",
          description: "Analyze",
          type: "llm-prompt",
          params: {
            prompt: "Analyze this",
            outputFormat: {
              type: "object",
              properties: { raw: { type: "string" } },
            },
          },
          nextStepId: "extract",
        },
        {
          id: "extract",
          name: "Extract",
          description: "Extract data",
          type: "extract-data",
          params: {
            sourceData: {
              type: "jmespath",
              expression: "analyze.rawOutput",
            },
            outputFormat: {
              type: "object",
              properties: { name: { type: "string" } },
            },
          },
          nextStepId: "done",
        },
        { id: "done", name: "Done", description: "End", type: "end" },
      ] as WorkflowDefinition["steps"],
    });

    const result = await compileWorkflow(workflow);
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_PROPERTY_PATH"),
    ).toBe(true);
    const diag = getFirstDiagnostic(
      result.diagnostics,
      "JMESPATH_INVALID_PROPERTY_PATH",
    );
    expect(diag.message).toContain("rawOutput");
    expect(diag.message).toContain("raw");
  });

  test("no warning when tool has no outputSchema", async () => {
    const workflow = makeWorkflow({
      steps: [
        {
          id: "start",
          name: "Start",
          description: "Start",
          type: "tool-call",
          params: { toolName: "do-thing", toolInput: {} },
          nextStepId: "report",
        },
        {
          id: "report",
          name: "Report",
          description: "Format report",
          type: "llm-prompt",
          params: {
            prompt: "Data: ${start.anything}",
            outputFormat: { type: "object" },
          },
          nextStepId: "done",
        },
        { id: "done", name: "Done", description: "End", type: "end" },
      ] as WorkflowDefinition["steps"],
    });

    const result = await compileWorkflow(workflow, { tools: testTools });
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_PROPERTY_PATH"),
    ).toBe(false);
  });

  test("silently skips complex JMESPath expressions", async () => {
    const tools = {
      "get-data": tool({
        inputSchema: type({}),
        outputSchema: type({ items: [{ name: "string" }, "[]"] }),
        execute: async () => ({ items: [] }),
      }),
    };

    const workflow = makeWorkflow({
      initialStepId: "fetch",
      steps: [
        {
          id: "fetch",
          name: "Fetch",
          description: "Get data",
          type: "tool-call",
          params: { toolName: "get-data", toolInput: {} },
          nextStepId: "report",
        },
        {
          id: "report",
          name: "Report",
          description: "Format",
          type: "llm-prompt",
          params: {
            prompt: "Data: ${fetch.items[0].name}",
            outputFormat: { type: "object" },
          },
          nextStepId: "done",
        },
        { id: "done", name: "Done", description: "End", type: "end" },
      ] as WorkflowDefinition["steps"],
    });

    const result = await compileWorkflow(workflow, { tools });
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_PROPERTY_PATH"),
    ).toBe(false);
  });

  test("no warning for root-only expression with no property path", async () => {
    const tools = {
      "get-data": tool({
        inputSchema: type({}),
        outputSchema: type({ result: "string" }),
        execute: async () => ({ result: "ok" }),
      }),
    };

    const workflow = makeWorkflow({
      initialStepId: "fetch",
      steps: [
        {
          id: "fetch",
          name: "Fetch",
          description: "Get data",
          type: "tool-call",
          params: { toolName: "get-data", toolInput: {} },
          nextStepId: "done",
        },
        {
          id: "done",
          name: "Done",
          description: "End",
          type: "end",
          params: {
            output: { type: "jmespath", expression: "fetch" },
          },
        },
      ] as WorkflowDefinition["steps"],
    });

    const result = await compileWorkflow(workflow, { tools });
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_PROPERTY_PATH"),
    ).toBe(false);
  });

  test("warns on nested property path failure", async () => {
    const tools = {
      "get-data": tool({
        inputSchema: type({}),
        outputSchema: type({
          response: { data: { count: "number" } },
        }),
        execute: async () => ({ response: { data: { count: 5 } } }),
      }),
    };

    const workflow = makeWorkflow({
      initialStepId: "fetch",
      steps: [
        {
          id: "fetch",
          name: "Fetch",
          description: "Get data",
          type: "tool-call",
          params: { toolName: "get-data", toolInput: {} },
          nextStepId: "report",
        },
        {
          id: "report",
          name: "Report",
          description: "Format",
          type: "llm-prompt",
          params: {
            prompt: "Items: ${fetch.response.data.items}",
            outputFormat: { type: "object" },
          },
          nextStepId: "done",
        },
        { id: "done", name: "Done", description: "End", type: "end" },
      ] as WorkflowDefinition["steps"],
    });

    const result = await compileWorkflow(workflow, { tools });
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_PROPERTY_PATH"),
    ).toBe(true);
    const diag = getFirstDiagnostic(
      result.diagnostics,
      "JMESPATH_INVALID_PROPERTY_PATH",
    );
    expect(diag.message).toContain("items");
    expect(diag.message).toContain("count");
  });

  test("validates input.field against workflow inputSchema", async () => {
    const workflow = makeWorkflow({
      inputSchema: {
        type: "object",
        properties: {
          userId: { type: "string" },
          email: { type: "string" },
        },
      },
      steps: [
        {
          id: "start",
          name: "Start",
          description: "Start",
          type: "tool-call",
          params: {
            toolName: "send-slack-message",
            toolInput: {
              channel: { type: "literal", value: "#general" },
              message: { type: "jmespath", expression: "input.nonexistent" },
            },
          },
          nextStepId: "done",
        },
        { id: "done", name: "Done", description: "End", type: "end" },
      ] as WorkflowDefinition["steps"],
    });

    const result = await compileWorkflow(workflow, { tools: testTools });
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_PROPERTY_PATH"),
    ).toBe(true);
    const diag = getFirstDiagnostic(
      result.diagnostics,
      "JMESPATH_INVALID_PROPERTY_PATH",
    );
    expect(diag.message).toContain("nonexistent");
    expect(diag.message).toContain("userId");
  });

  test("no warning for valid input.field reference", async () => {
    const workflow = makeWorkflow({
      inputSchema: {
        type: "object",
        properties: {
          userId: { type: "string" },
        },
      },
      steps: [
        {
          id: "start",
          name: "Start",
          description: "Start",
          type: "tool-call",
          params: {
            toolName: "send-slack-message",
            toolInput: {
              channel: { type: "literal", value: "#general" },
              message: { type: "jmespath", expression: "input.userId" },
            },
          },
          nextStepId: "done",
        },
        { id: "done", name: "Done", description: "End", type: "end" },
      ] as WorkflowDefinition["steps"],
    });

    const result = await compileWorkflow(workflow, { tools: testTools });
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_PROPERTY_PATH"),
    ).toBe(false);
  });

  test("catches invalid path without tools when llm-prompt has outputFormat", async () => {
    const workflow = makeWorkflow({
      initialStepId: "analyze",
      steps: [
        {
          id: "analyze",
          name: "Analyze",
          description: "Analyze",
          type: "llm-prompt",
          params: {
            prompt: "Analyze this",
            outputFormat: {
              type: "object",
              properties: { summary: { type: "string" } },
            },
          },
          nextStepId: "done",
        },
        {
          id: "done",
          name: "Done",
          description: "End",
          type: "end",
          params: {
            output: { type: "jmespath", expression: "analyze.nonexistent" },
          },
        },
      ] as WorkflowDefinition["steps"],
    });

    // Compile without tools
    const result = await compileWorkflow(workflow);
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_PROPERTY_PATH"),
    ).toBe(true);
  });

  test("does not mask JMESPATH_INVALID_ROOT_REFERENCE for unknown roots", async () => {
    const workflow = makeWorkflow({
      steps: [
        {
          id: "start",
          name: "Start",
          description: "Start",
          type: "llm-prompt",
          params: {
            prompt: "Data: ${unknown_step.field}",
            outputFormat: { type: "object" },
          },
          nextStepId: "done",
        },
        { id: "done", name: "Done", description: "End", type: "end" },
      ] as WorkflowDefinition["steps"],
    });

    const result = await compileWorkflow(workflow);
    // Root reference error should still fire
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_ROOT_REFERENCE"),
    ).toBe(true);
    // Property path warning should NOT fire (unknown root is handled separately)
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_PROPERTY_PATH"),
    ).toBe(false);
  });

  test("warns on invalid property in for-each target expression", async () => {
    const workflow = makeWorkflow({
      initialStepId: "analyze",
      steps: [
        {
          id: "analyze",
          name: "Analyze",
          description: "Analyze",
          type: "llm-prompt",
          params: {
            prompt: "Analyze this",
            outputFormat: {
              type: "object",
              properties: {
                items: { type: "array", items: { type: "string" } },
              },
            },
          },
          nextStepId: "loop",
        },
        {
          id: "loop",
          name: "Loop",
          description: "Loop",
          type: "for-each",
          params: {
            target: { type: "jmespath", expression: "analyze.results" },
            itemName: "item",
            loopBodyStepId: "process",
          },
          nextStepId: "done",
        },
        {
          id: "process",
          name: "Process",
          description: "Process item",
          type: "tool-call",
          params: { toolName: "do-thing", toolInput: {} },
        },
        { id: "done", name: "Done", description: "End", type: "end" },
      ] as WorkflowDefinition["steps"],
    });

    const result = await compileWorkflow(workflow, { tools: testTools });
    expect(
      hasDiagnostic(result.diagnostics, "JMESPATH_INVALID_PROPERTY_PATH"),
    ).toBe(true);
    const diag = getFirstDiagnostic(
      result.diagnostics,
      "JMESPATH_INVALID_PROPERTY_PATH",
    );
    expect(diag.message).toContain("results");
    expect(diag.message).toContain("items");
  });

  test("catches invalid .data references in daily vulnerability report workflow", async () => {
    const tools = {
      queryWarehouseData: tool({
        inputSchema: type({
          sql: "string",
          dataTableContext: "string",
        }),
        outputSchema: type([
          {
            "string?": "string | number | boolean | null",
          },
          "[]",
        ]),
        execute: async () => [],
      }),
      "send-notification": tool({
        inputSchema: type({
          body: "string",
          subject: "string",
          destination: "object",
        }),
        execute: async () => ({}),
      }),
    };

    const workflow: WorkflowDefinition = {
      initialStepId: "start",
      steps: [
        {
          id: "start",
          name: "Start",
          type: "start",
          nextStepId: "query_summary_stats",
          description: "Start the daily vulnerability report workflow",
        },
        {
          id: "query_summary_stats",
          name: "Query Summary Statistics",
          type: "tool-call",
          params: {
            toolName: "queryWarehouseData",
            toolInput: {
              sql: {
                type: "literal",
                value:
                  "SELECT COUNT(*) AS total_new_vulns FROM otto_dev26.otto_vulnerabilities v WHERE v.partition_date = CURRENT_DATE AND v.first_seen_date = CURRENT_DATE",
              },
              dataTableContext: {
                type: "literal",
                value: "Summary stats for new vulnerabilities discovered today",
              },
            },
          },
          nextStepId: "query_severity_breakdown",
          description: "Query total new vulnerabilities for today",
        },
        {
          id: "query_severity_breakdown",
          name: "Query Severity Breakdown",
          type: "tool-call",
          params: {
            toolName: "queryWarehouseData",
            toolInput: {
              sql: {
                type: "literal",
                value:
                  "SELECT kb.severity, COUNT(*) AS vuln_count FROM otto_dev26.otto_vulnerabilities v LEFT JOIN otto_dev26.otto_qualys_vuln_kb kb ON CAST(kb.qid AS VARCHAR) = v.qualys_qid WHERE v.partition_date = CURRENT_DATE AND v.first_seen_date = CURRENT_DATE GROUP BY kb.severity ORDER BY vuln_count DESC",
              },
              dataTableContext: {
                type: "literal",
                value:
                  "New vulnerability counts broken down by severity for today",
              },
            },
          },
          nextStepId: "query_top_hosts",
          description: "Count new vulnerabilities grouped by severity",
        },
        {
          id: "query_top_hosts",
          name: "Query Top 5 Affected Hosts",
          type: "tool-call",
          params: {
            toolName: "queryWarehouseData",
            toolInput: {
              sql: {
                type: "literal",
                value:
                  "SELECT v.hostname, COUNT(*) AS new_vuln_count FROM otto_dev26.otto_vulnerabilities v WHERE v.partition_date = CURRENT_DATE AND v.first_seen_date = CURRENT_DATE GROUP BY v.hostname ORDER BY new_vuln_count DESC LIMIT 5",
              },
              dataTableContext: {
                type: "literal",
                value: "Top 5 hosts by new vulnerability count today",
              },
            },
          },
          nextStepId: "format_report",
          description:
            "Find the 5 hosts with the most new vulnerabilities today",
        },
        {
          id: "format_report",
          name: "Format Vulnerability Report",
          type: "llm-prompt",
          params: {
            prompt:
              "You are a security reporting assistant. Format the following vulnerability data into a clean, concise markdown report.\n\nSummary Statistics (JSON): ${query_summary_stats.data}\n\nSeverity Breakdown (JSON): ${query_severity_breakdown.data}\n\nTop 5 Most Affected Hosts (JSON): ${query_top_hosts.data}\n\nFormat the report with the following sections:\n1. A headline showing today's date and the total new vulnerability count\n2. A severity breakdown table\n3. A Top 5 Most Affected Hosts table\n4. A highlighted line showing patchable vulnerabilities\n5. A brief 1-2 sentence executive summary\n\nUse proper markdown. Be concise and factual.",
            outputFormat: {
              type: "object",
              required: ["report_markdown", "report_date"],
              properties: {
                report_date: {
                  type: "string",
                  description: "The date of the report in YYYY-MM-DD format",
                },
                report_markdown: {
                  type: "string",
                  description:
                    "The fully formatted markdown vulnerability report",
                },
              },
            },
          },
          nextStepId: "send_notification",
          description:
            "Use an LLM to format all query results into a clean markdown report",
        },
        {
          id: "send_notification",
          name: "Send OttoGuard Notification",
          type: "tool-call",
          params: {
            toolName: "send-notification",
            toolInput: {
              body: {
                type: "jmespath",
                expression: "format_report.report_markdown",
              },
              subject: {
                type: "template",
                template:
                  "Daily Vulnerability Report – ${format_report.report_date}",
              },
              destination: {
                type: "literal",
                value: {
                  type: "direct",
                  method: "ottoguard-ui",
                },
              },
            },
          },
          nextStepId: "end_workflow",
          description:
            "Send the formatted report as an in-app OttoGuard notification",
        },
        {
          id: "end_workflow",
          name: "End",
          type: "end",
          params: {
            output: {
              type: "jmespath",
              expression: "format_report.report_markdown",
            },
          },
          description: "Workflow complete — daily vulnerability report sent",
        },
      ],
    } as WorkflowDefinition;

    const result = await compileWorkflow(workflow, { tools });

    // The three ${...data} references in the llm-prompt should all be caught
    const pathDiags = getDiagnostics(
      result.diagnostics,
      "JMESPATH_INVALID_PROPERTY_PATH",
    );
    expect(pathDiags.length).toBe(3);

    // All three should reference the "data" property
    for (const diag of pathDiags) {
      expect(diag.severity).toBe("error");
      expect(diag.message).toContain("data");
      expect(diag.location.stepId).toBe("format_report");
    }

    // The valid references (format_report.report_markdown, format_report.report_date)
    // should NOT trigger warnings — verify they aren't in the diagnostics
    const allMessages = pathDiags.map((d) => d.message).join(" ");
    expect(allMessages).not.toContain("report_markdown");
    expect(allMessages).not.toContain("report_date");
  });
});

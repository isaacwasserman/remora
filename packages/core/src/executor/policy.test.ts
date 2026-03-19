import { describe, expect, test } from "bun:test";
import { tool } from "ai";
import { type } from "arktype";
import type { WorkflowDefinition } from "../types";
import { executeWorkflow } from ".";
import { AuthorizationError } from "./errors";
import type { Policy, PolicyDecision } from "./policy";
import type { ExecutionDelta } from "./state";

// ─── Test Tools ─────────────────────────────────────────────────

const testTools = {
  greet: tool({
    inputSchema: type({ name: "string" }),
    execute: async ({ name }) => ({ greeting: `Hello, ${name}!` }),
  }),
  echo: tool({
    inputSchema: type({}),
    execute: async () => ({ echoed: true }),
  }),
};

// ─── Test Workflow ──────────────────────────────────────────────

const simpleToolCallWorkflow: WorkflowDefinition = {
  initialStepId: "start",
  steps: [
    {
      id: "start",
      name: "Start",
      description: "Start",
      type: "start",
      nextStepId: "call_greet",
    },
    {
      id: "call_greet",
      name: "Greet",
      description: "Call greet tool",
      type: "tool-call",
      params: {
        toolName: "greet",
        toolInput: { name: { type: "literal", value: "World" } },
      },
      nextStepId: "end_step",
    },
    { id: "end_step", name: "End", description: "End", type: "end" },
  ],
};

const twoToolCallWorkflow: WorkflowDefinition = {
  initialStepId: "start",
  steps: [
    {
      id: "start",
      name: "Start",
      description: "Start",
      type: "start",
      nextStepId: "call_greet",
    },
    {
      id: "call_greet",
      name: "Greet",
      description: "Call greet tool",
      type: "tool-call",
      params: {
        toolName: "greet",
        toolInput: { name: { type: "literal", value: "World" } },
      },
      nextStepId: "call_echo",
    },
    {
      id: "call_echo",
      name: "Echo",
      description: "Call echo tool",
      type: "tool-call",
      params: {
        toolName: "echo",
        toolInput: {},
      },
      nextStepId: "end_step",
    },
    { id: "end_step", name: "End", description: "End", type: "end" },
  ],
};

// ─── Helper: create a policy ─────────────────────────────────────

function createPolicy(
  id: string,
  decide: (action: {
    type: string;
    params: { toolName: string };
  }) => PolicyDecision,
): Policy {
  return {
    id,
    decider: (_ctx, action) =>
      Promise.resolve({ ...decide(action), sourcePolicyId: id }),
  };
}

// ─── Tests ──────────────────────────────────────────────────────

describe("Policy evaluation", () => {
  test("no policies configured — workflow executes normally", async () => {
    const result = await executeWorkflow(simpleToolCallWorkflow, {
      tools: testTools,
    });
    expect(result.success).toBe(true);
  });

  test("empty policies array — workflow executes normally", async () => {
    const result = await executeWorkflow(simpleToolCallWorkflow, {
      tools: testTools,
      policies: [],
    });
    expect(result.success).toBe(true);
  });

  test("policy approves — workflow executes normally", async () => {
    const result = await executeWorkflow(simpleToolCallWorkflow, {
      tools: testTools,
      policies: [
        createPolicy("allow-all", () => ({
          type: "approve",
          sourcePolicyId: "allow-all",
        })),
      ],
    });
    expect(result.success).toBe(true);
    expect(result.stepOutputs.call_greet).toEqual({
      greeting: "Hello, World!",
    });
  });

  test("policy rejects — workflow fails with AuthorizationError", async () => {
    const result = await executeWorkflow(simpleToolCallWorkflow, {
      tools: testTools,
      policies: [
        createPolicy("deny-all", () => ({
          type: "reject",
          sourcePolicyId: "deny-all",
        })),
      ],
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(AuthorizationError);
    expect((result.error as AuthorizationError).sourcePolicyId).toBe(
      "deny-all",
    );
    expect((result.error as AuthorizationError).code).toBe("POLICY_DENIED");
  });

  test("policy defers then next policy approves", async () => {
    const result = await executeWorkflow(simpleToolCallWorkflow, {
      tools: testTools,
      policies: [
        createPolicy("no-opinion", () => ({
          type: "defer",
          sourcePolicyId: "no-opinion",
        })),
        createPolicy("allow-all", () => ({
          type: "approve",
          sourcePolicyId: "allow-all",
        })),
      ],
    });
    expect(result.success).toBe(true);
  });

  test("policy defers then next policy rejects", async () => {
    const result = await executeWorkflow(simpleToolCallWorkflow, {
      tools: testTools,
      policies: [
        createPolicy("no-opinion", () => ({
          type: "defer",
          sourcePolicyId: "no-opinion",
        })),
        createPolicy("deny-all", () => ({
          type: "reject",
          sourcePolicyId: "deny-all",
        })),
      ],
    });
    expect(result.success).toBe(false);
    expect((result.error as AuthorizationError).sourcePolicyId).toBe(
      "deny-all",
    );
  });

  test("all policies defer — action is approved by default", async () => {
    const result = await executeWorkflow(simpleToolCallWorkflow, {
      tools: testTools,
      policies: [
        createPolicy("p1", () => ({ type: "defer", sourcePolicyId: "p1" })),
        createPolicy("p2", () => ({ type: "defer", sourcePolicyId: "p2" })),
      ],
    });
    expect(result.success).toBe(true);
    expect(result.stepOutputs.call_greet).toEqual({
      greeting: "Hello, World!",
    });
  });

  test("first non-defer policy wins — approve short-circuits", async () => {
    let secondPolicyCalled = false;
    const result = await executeWorkflow(simpleToolCallWorkflow, {
      tools: testTools,
      policies: [
        createPolicy("allow-all", () => ({
          type: "approve",
          sourcePolicyId: "allow-all",
        })),
        {
          id: "should-not-run",
          decider: async () => {
            secondPolicyCalled = true;
            return {
              type: "reject" as const,
              sourcePolicyId: "should-not-run",
            };
          },
        },
      ],
    });
    expect(result.success).toBe(true);
    expect(secondPolicyCalled).toBe(false);
  });

  test("policy only applies to tool-call steps", async () => {
    // A workflow with start + end (no tool calls) should not trigger policies
    const noToolWorkflow: WorkflowDefinition = {
      initialStepId: "start",
      steps: [
        {
          id: "start",
          name: "Start",
          description: "Start",
          type: "start",
          nextStepId: "end_step",
        },
        { id: "end_step", name: "End", description: "End", type: "end" },
      ],
    };
    let policyCalled = false;
    const result = await executeWorkflow(noToolWorkflow, {
      tools: testTools,
      policies: [
        {
          id: "tracker",
          decider: async () => {
            policyCalled = true;
            return { type: "reject" as const, sourcePolicyId: "tracker" };
          },
        },
      ],
    });
    expect(result.success).toBe(true);
    expect(policyCalled).toBe(false);
  });

  test("policy receives correct action with resolved inputs", async () => {
    let capturedAction: unknown;
    const result = await executeWorkflow(simpleToolCallWorkflow, {
      tools: testTools,
      policies: [
        {
          id: "capture",
          decider: async (_ctx, action) => {
            capturedAction = action;
            return { type: "approve" as const, sourcePolicyId: "capture" };
          },
        },
      ],
    });
    expect(result.success).toBe(true);
    expect(capturedAction).toEqual({
      type: "tool-call",
      params: {
        toolName: "greet",
        toolInput: { name: "World" },
      },
    });
  });

  test("policy receives execution context", async () => {
    let capturedContext: unknown;
    const result = await executeWorkflow(simpleToolCallWorkflow, {
      tools: testTools,
      executionContext: { userId: "user-123", orgId: "org-456" },
      policies: [
        {
          id: "ctx-check",
          decider: async (ctx) => {
            capturedContext = ctx;
            return { type: "approve" as const, sourcePolicyId: "ctx-check" };
          },
        },
      ],
    });
    expect(result.success).toBe(true);
    expect(capturedContext).toEqual({ userId: "user-123", orgId: "org-456" });
  });

  test("policy selectively rejects specific tools", async () => {
    const result = await executeWorkflow(twoToolCallWorkflow, {
      tools: testTools,
      policies: [
        {
          id: "block-echo",
          decider: async (_ctx, action) => {
            if (action.params.toolName === "echo") {
              return { type: "reject" as const, sourcePolicyId: "block-echo" };
            }
            return { type: "approve" as const, sourcePolicyId: "block-echo" };
          },
        },
      ],
    });
    expect(result.success).toBe(false);
    expect((result.error as AuthorizationError).sourcePolicyId).toBe(
      "block-echo",
    );
    // greet should have executed before echo was rejected
    expect(result.stepOutputs.call_greet).toEqual({
      greeting: "Hello, World!",
    });
  });
});

describe("Approval request flow", () => {
  test("request + conditionFn returns approved — step executes", async () => {
    const result = await executeWorkflow(simpleToolCallWorkflow, {
      tools: testTools,
      approvalIntervalMs: 10, // fast polling for tests
      policies: [
        {
          id: "needs-approval",
          decider: async () => ({
            type: "request" as const,
            sourcePolicyId: "needs-approval",
            requestFn: async () => {},
            conditionFn: () => ({ approved: true, reason: "Looks good" }),
          }),
        },
      ],
    });
    expect(result.success).toBe(true);
    expect(result.stepOutputs.call_greet).toEqual({
      greeting: "Hello, World!",
    });
  });

  test("request + conditionFn returns denied — step fails", async () => {
    const result = await executeWorkflow(simpleToolCallWorkflow, {
      tools: testTools,
      approvalIntervalMs: 10,
      policies: [
        {
          id: "needs-approval",
          decider: async () => ({
            type: "request" as const,
            sourcePolicyId: "needs-approval",
            requestFn: async () => {},
            conditionFn: () => ({ approved: false, reason: "Not allowed" }),
          }),
        },
      ],
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(AuthorizationError);
    expect((result.error as AuthorizationError).message).toContain(
      "Not allowed",
    );
  });

  test("request + conditionFn polls until approved", async () => {
    let pollCount = 0;
    const result = await executeWorkflow(simpleToolCallWorkflow, {
      tools: testTools,
      approvalIntervalMs: 10,
      policies: [
        {
          id: "delayed-approval",
          decider: async () => ({
            type: "request" as const,
            sourcePolicyId: "delayed-approval",
            requestFn: async () => {},
            conditionFn: () => {
              pollCount++;
              if (pollCount < 3) return null; // still pending
              return { approved: true };
            },
          }),
        },
      ],
    });
    expect(result.success).toBe(true);
    expect(pollCount).toBe(3);
  });

  test("request + timeout — treated as rejection", async () => {
    const result = await executeWorkflow(simpleToolCallWorkflow, {
      tools: testTools,
      approvalTimeoutMs: 50,
      approvalIntervalMs: 10,
      policies: [
        {
          id: "never-responds",
          decider: async () => ({
            type: "request" as const,
            sourcePolicyId: "never-responds",
            requestFn: async () => {},
            conditionFn: () => null, // always pending
          }),
        },
      ],
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(AuthorizationError);
    expect((result.error as AuthorizationError).message).toContain("timed out");
  });

  test("staleFn checked before conditionFn — stale request treated as rejection", async () => {
    const callOrder: string[] = [];
    const result = await executeWorkflow(simpleToolCallWorkflow, {
      tools: testTools,
      approvalIntervalMs: 10,
      policies: [
        {
          id: "stale-check",
          decider: async () => ({
            type: "request" as const,
            sourcePolicyId: "stale-check",
            requestFn: async () => {},
            staleFn: () => {
              callOrder.push("stale");
              return { stale: true, reason: "Workflow re-run detected" };
            },
            conditionFn: () => {
              callOrder.push("condition");
              return { approved: true };
            },
          }),
        },
      ],
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(AuthorizationError);
    expect((result.error as AuthorizationError).message).toContain(
      "Workflow re-run detected",
    );
    // staleFn should be called, conditionFn should NOT be called
    expect(callOrder).toEqual(["stale"]);
  });

  test("staleFn returns not stale — conditionFn proceeds normally", async () => {
    let staleChecks = 0;
    const result = await executeWorkflow(simpleToolCallWorkflow, {
      tools: testTools,
      approvalIntervalMs: 10,
      policies: [
        {
          id: "stale-then-approve",
          decider: async () => ({
            type: "request" as const,
            sourcePolicyId: "stale-then-approve",
            requestFn: async () => {},
            staleFn: () => {
              staleChecks++;
              return { stale: false };
            },
            conditionFn: () => ({ approved: true }),
          }),
        },
      ],
    });
    expect(result.success).toBe(true);
    expect(staleChecks).toBeGreaterThan(0);
  });

  test("staleFn becomes stale after initial polls", async () => {
    let pollCount = 0;
    const result = await executeWorkflow(simpleToolCallWorkflow, {
      tools: testTools,
      approvalIntervalMs: 10,
      policies: [
        {
          id: "late-stale",
          decider: async () => ({
            type: "request" as const,
            sourcePolicyId: "late-stale",
            requestFn: async () => {},
            staleFn: () => {
              pollCount++;
              return pollCount >= 3
                ? { stale: true, reason: "Gone stale" }
                : { stale: false };
            },
            conditionFn: () => null, // never approves
          }),
        },
      ],
    });
    expect(result.success).toBe(false);
    expect(pollCount).toBe(3);
    expect((result.error as AuthorizationError).message).toContain(
      "Gone stale",
    );
  });

  test("onApproval callback invoked on approval", async () => {
    let callbackDecision: unknown;
    const result = await executeWorkflow(simpleToolCallWorkflow, {
      tools: testTools,
      approvalIntervalMs: 10,
      policies: [
        {
          id: "on-approval",
          decider: async () => ({
            type: "request" as const,
            sourcePolicyId: "on-approval",
            requestFn: async () => {},
            conditionFn: () => ({
              approved: true,
              reason: "Looks good",
            }),
            onApproval: async (decision) => {
              callbackDecision = decision;
            },
          }),
        },
      ],
    });
    expect(result.success).toBe(true);
    expect(callbackDecision).toEqual({
      approved: true,
      reason: "Looks good",
    });
  });

  test("onApproval callback invoked on denial", async () => {
    let callbackDecision: unknown;
    const result = await executeWorkflow(simpleToolCallWorkflow, {
      tools: testTools,
      approvalIntervalMs: 10,
      policies: [
        {
          id: "on-denial",
          decider: async () => ({
            type: "request" as const,
            sourcePolicyId: "on-denial",
            requestFn: async () => {},
            conditionFn: () => ({
              approved: false,
              reason: "Nope",
            }),
            onApproval: async (decision) => {
              callbackDecision = decision;
            },
          }),
        },
      ],
    });
    expect(result.success).toBe(false);
    expect(callbackDecision).toEqual({ approved: false, reason: "Nope" });
  });

  test("backoff increases polling interval over time", async () => {
    const pollTimes: number[] = [];
    let pollCount = 0;
    const result = await executeWorkflow(simpleToolCallWorkflow, {
      tools: testTools,
      approvalIntervalMs: 50,
      approvalBackoffMultiplier: 2,
      approvalMaxIntervalMs: 500,
      policies: [
        {
          id: "backoff-test",
          decider: async () => ({
            type: "request" as const,
            sourcePolicyId: "backoff-test",
            requestFn: async () => {},
            conditionFn: () => {
              pollTimes.push(Date.now());
              pollCount++;
              if (pollCount >= 5) return { approved: true };
              return null;
            },
          }),
        },
      ],
    });
    expect(result.success).toBe(true);
    expect(pollCount).toBe(5);
    // Intervals should be increasing (with backoff)
    if (pollTimes.length >= 4) {
      const interval1 = (pollTimes[2] as number) - (pollTimes[1] as number);
      const interval2 = (pollTimes[3] as number) - (pollTimes[2] as number);
      // Second interval should be larger than first due to backoff
      expect(interval2).toBeGreaterThan(interval1 * 0.8); // allow some timing slack
    }
  });

  test("requestFn is called before polling", async () => {
    const callOrder: string[] = [];
    const result = await executeWorkflow(simpleToolCallWorkflow, {
      tools: testTools,
      approvalIntervalMs: 10,
      policies: [
        {
          id: "order-check",
          decider: async () => ({
            type: "request" as const,
            sourcePolicyId: "order-check",
            requestFn: async (_callbackId) => {
              callOrder.push("request");
            },
            conditionFn: () => {
              callOrder.push("condition");
              return { approved: true };
            },
          }),
        },
      ],
    });
    expect(result.success).toBe(true);
    expect(callOrder[0]).toBe("request");
    expect(callOrder[1]).toBe("condition");
  });
});

describe("Policy state deltas", () => {
  test("approval flow emits awaiting-approval and approved deltas", async () => {
    const deltas: ExecutionDelta[] = [];
    const result = await executeWorkflow(simpleToolCallWorkflow, {
      tools: testTools,
      approvalIntervalMs: 10,
      onStateChange: (_state, delta) => {
        deltas.push(delta);
      },
      policies: [
        {
          id: "approve-policy",
          decider: async () => ({
            type: "request" as const,
            sourcePolicyId: "approve-policy",
            requestFn: async () => {},
            conditionFn: () => ({ approved: true }),
          }),
        },
      ],
    });
    expect(result.success).toBe(true);

    const awaitingDelta = deltas.find(
      (d) => d.type === "step-awaiting-approval",
    );
    expect(awaitingDelta).toBeDefined();
    expect(
      awaitingDelta?.type === "step-awaiting-approval" &&
        awaitingDelta?.sourcePolicyId,
    ).toBe("approve-policy");
    expect(
      awaitingDelta?.type === "step-awaiting-approval" && awaitingDelta?.stepId,
    ).toBe("call_greet");

    const approvedDelta = deltas.find((d) => d.type === "step-approved");
    expect(approvedDelta).toBeDefined();
    expect(
      approvedDelta?.type === "step-approved" && approvedDelta?.sourcePolicyId,
    ).toBe("approve-policy");
  });

  test("denial flow emits awaiting-approval and denied deltas", async () => {
    const deltas: ExecutionDelta[] = [];
    const result = await executeWorkflow(simpleToolCallWorkflow, {
      tools: testTools,
      approvalIntervalMs: 10,
      onStateChange: (_state, delta) => {
        deltas.push(delta);
      },
      policies: [
        {
          id: "deny-policy",
          decider: async () => ({
            type: "request" as const,
            sourcePolicyId: "deny-policy",
            requestFn: async () => {},
            conditionFn: () => ({ approved: false, reason: "Nope" }),
          }),
        },
      ],
    });
    expect(result.success).toBe(false);

    const awaitingDelta = deltas.find(
      (d) => d.type === "step-awaiting-approval",
    );
    expect(awaitingDelta).toBeDefined();

    const deniedDelta = deltas.find((d) => d.type === "step-denied");
    expect(deniedDelta).toBeDefined();
    expect(deniedDelta?.type === "step-denied" && deniedDelta?.reason).toBe(
      "Nope",
    );
  });

  test("rejection emits run-failed delta with POLICY_DENIED", async () => {
    const deltas: ExecutionDelta[] = [];
    const result = await executeWorkflow(simpleToolCallWorkflow, {
      tools: testTools,
      onStateChange: (_state, delta) => {
        deltas.push(delta);
      },
      policies: [
        createPolicy("deny", () => ({
          type: "reject",
          sourcePolicyId: "deny",
        })),
      ],
    });
    expect(result.success).toBe(false);

    const runFailedDelta = deltas.find((d) => d.type === "run-failed");
    expect(runFailedDelta).toBeDefined();
    expect(
      runFailedDelta?.type === "run-failed" && runFailedDelta?.error.code,
    ).toBe("POLICY_DENIED");
  });

  test("execution state shows awaiting-approval status during approval", async () => {
    let awaitingState: unknown;
    const result = await executeWorkflow(simpleToolCallWorkflow, {
      tools: testTools,
      approvalIntervalMs: 10,
      onStateChange: (state, delta) => {
        if (delta.type === "step-awaiting-approval") {
          const record = state.stepRecords.find(
            (r) => r.stepId === "call_greet",
          );
          awaitingState = record?.status;
        }
      },
      policies: [
        {
          id: "approval",
          decider: async () => ({
            type: "request" as const,
            sourcePolicyId: "approval",
            requestFn: async () => {},
            conditionFn: () => ({ approved: true }),
          }),
        },
      ],
    });
    expect(result.success).toBe(true);
    expect(awaitingState).toBe("awaiting-approval");
  });
});

describe("waitForCallback integration", () => {
  test("waitForCallback resolves before polling — uses callback result", async () => {
    const { createDefaultDurableContext } = await import("./context");
    const defaultCtx = createDefaultDurableContext();

    const result = await executeWorkflow(simpleToolCallWorkflow, {
      tools: testTools,
      approvalIntervalMs: 10,
      context: {
        ...defaultCtx,
        waitForCallback: async (_name, submitter, _timeoutMs) => {
          // Simulate: callback arrives instantly
          await submitter("callback-id-123");
          return { approved: true, reason: "Callback approved" };
        },
      },
      policies: [
        {
          id: "callback-policy",
          decider: async () => ({
            type: "request" as const,
            sourcePolicyId: "callback-policy",
            conditionFn: () => null, // polling never resolves
          }),
        },
      ],
    });
    expect(result.success).toBe(true);
    expect(result.stepOutputs.call_greet).toEqual({
      greeting: "Hello, World!",
    });
  });

  test("waitForCallback passes callbackId to requestFn", async () => {
    const { createDefaultDurableContext } = await import("./context");
    const defaultCtx = createDefaultDurableContext();
    let capturedCallbackId: string | undefined;

    const result = await executeWorkflow(simpleToolCallWorkflow, {
      tools: testTools,
      approvalIntervalMs: 10,
      context: {
        ...defaultCtx,
        waitForCallback: async (_name, submitter, _timeoutMs) => {
          await submitter("env-provided-callback-id");
          return { approved: true };
        },
      },
      policies: [
        {
          id: "capture-id",
          decider: async () => ({
            type: "request" as const,
            sourcePolicyId: "capture-id",
            requestFn: async (callbackId: string) => {
              capturedCallbackId = callbackId;
            },
            conditionFn: () => null,
          }),
        },
      ],
    });
    expect(result.success).toBe(true);
    expect(capturedCallbackId).toBe("env-provided-callback-id");
  });

  test("polling resolves before waitForCallback — uses polling result", async () => {
    const { createDefaultDurableContext } = await import("./context");
    const defaultCtx = createDefaultDurableContext();

    const result = await executeWorkflow(simpleToolCallWorkflow, {
      tools: testTools,
      approvalIntervalMs: 10,
      context: {
        ...defaultCtx,
        waitForCallback: async (_name, submitter, _timeoutMs) => {
          await submitter("callback-id");
          // Simulate: callback never resolves (takes forever)
          return new Promise(() => {});
        },
      },
      policies: [
        {
          id: "poll-wins",
          decider: async () => ({
            type: "request" as const,
            sourcePolicyId: "poll-wins",
            conditionFn: () => ({
              approved: true,
              reason: "Polling resolved first",
            }),
          }),
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  test("requestFn not called twice when waitForCallback is present", async () => {
    const { createDefaultDurableContext } = await import("./context");
    const defaultCtx = createDefaultDurableContext();
    let requestCallCount = 0;

    const result = await executeWorkflow(simpleToolCallWorkflow, {
      tools: testTools,
      approvalIntervalMs: 10,
      context: {
        ...defaultCtx,
        waitForCallback: async (_name, submitter, _timeoutMs) => {
          await submitter("cb-id");
          return { approved: true };
        },
      },
      policies: [
        {
          id: "no-double-call",
          decider: async () => ({
            type: "request" as const,
            sourcePolicyId: "no-double-call",
            requestFn: async (_callbackId: string) => {
              requestCallCount++;
            },
            conditionFn: () => null,
          }),
        },
      ],
    });
    expect(result.success).toBe(true);
    // requestFn should be called exactly once (inside waitForCallback's submitter)
    expect(requestCallCount).toBe(1);
  });

  test("without waitForCallback, requestFn receives synthetic callbackId", async () => {
    let capturedCallbackId: string | undefined;

    const result = await executeWorkflow(simpleToolCallWorkflow, {
      tools: testTools,
      approvalIntervalMs: 10,
      policies: [
        {
          id: "synthetic-id",
          decider: async () => ({
            type: "request" as const,
            sourcePolicyId: "synthetic-id",
            requestFn: async (callbackId: string) => {
              capturedCallbackId = callbackId;
            },
            conditionFn: () => ({ approved: true }),
          }),
        },
      ],
    });
    expect(result.success).toBe(true);
    expect(capturedCallbackId).toBeDefined();
    expect(capturedCallbackId).toContain("approval:");
  });

  test("requestFn-only with waitForCallback — event-based only", async () => {
    const { createDefaultDurableContext } = await import("./context");
    const defaultCtx = createDefaultDurableContext();

    const result = await executeWorkflow(simpleToolCallWorkflow, {
      tools: testTools,
      context: {
        ...defaultCtx,
        waitForCallback: async (_name, submitter, _timeoutMs) => {
          await submitter("callback-id");
          return { approved: true, reason: "Event-based approval" };
        },
      },
      policies: [
        {
          id: "event-only",
          decider: async () => ({
            type: "request" as const,
            sourcePolicyId: "event-only",
            requestFn: async (_callbackId: string) => {},
          }),
        },
      ],
    });
    expect(result.success).toBe(true);
    expect(result.stepOutputs.call_greet).toEqual({
      greeting: "Hello, World!",
    });
  });

  test("requestFn-only without waitForCallback — throws AuthorizationError", async () => {
    const result = await executeWorkflow(simpleToolCallWorkflow, {
      tools: testTools,
      policies: [
        {
          id: "event-only-no-ctx",
          decider: async () => ({
            type: "request" as const,
            sourcePolicyId: "event-only-no-ctx",
            requestFn: async (_callbackId: string) => {},
          }),
        },
      ],
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(AuthorizationError);
    expect((result.error as AuthorizationError).message).toContain(
      "waitForCallback",
    );
  });

  test("conditionFn-only without requestFn — polling works normally", async () => {
    const result = await executeWorkflow(simpleToolCallWorkflow, {
      tools: testTools,
      approvalIntervalMs: 10,
      policies: [
        {
          id: "poll-only",
          decider: async () => ({
            type: "request" as const,
            sourcePolicyId: "poll-only",
            conditionFn: () => ({ approved: true }),
          }),
        },
      ],
    });
    expect(result.success).toBe(true);
    expect(result.stepOutputs.call_greet).toEqual({
      greeting: "Hello, World!",
    });
  });
});

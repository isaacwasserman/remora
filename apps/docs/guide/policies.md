# Policies & Approvals

Your agent built a beautiful workflow. It compiles. It runs. It sends emails, updates databases, files tickets, provisions infrastructure — all without a human touching it.

Your enterprise customer sees this and says: *"Great. Now make it so nothing actually happens until someone on my team clicks Approve."*

Welcome to the policy system.

## The Problem

Enterprise software has a trust problem — and it should. When an AI agent wants to call `deleteUser` or `transferFunds` or `sendEmailToAllCustomers`, someone with authority needs to be in the loop. Not after the fact. Not in a log file. *Before the action executes.*

But "human-in-the-loop" is easy to say and miserable to build. You need approval routing, timeout handling, polling, callbacks, stale request detection, state tracking, and a way to resume execution after the human finally gets back from lunch. Most teams either skip it entirely or build a brittle, one-off solution that breaks the first time the approver's Slack notification gets lost.

RemoraFlow's policy system gives you all of this out of the box.

## How It Works

A **policy** is a function that runs before every tool call in your workflow. It looks at what's about to happen — which tool, with what inputs — and makes a decision:

| Decision | Effect |
|---|---|
| `approve` | Action proceeds immediately. Remaining policies are skipped. |
| `reject` | Action is denied. An `AuthorizationError` is thrown. |
| `defer` | No opinion. Move on to the next policy. |
| `request` | Pause execution and wait for external approval. |

Policies are evaluated in order. The first non-`defer` decision wins. If every policy defers, the action is approved by default — no policies, no problem.

Let's say you're building a CRM automation platform. Your workflow can look up contacts, draft emails, and send them. You want two rules:

1. **No one** can call `delete-account`. Ever. Hard stop.
2. Sending emails is fine for admins, but if a non-admin tries it, a manager needs to approve first.

```ts
import type { Policy } from "@remoraflow/core";

type MyContext = {
  userId: string;
  role: "admin" | "member";
  orgId: string;
};

// Policy 1: Hard deny on dangerous tools — instant, no questions asked
const blocklist: Policy<MyContext> = {
  id: "blocklist",
  decider: (_ctx, action) => {
    const forbidden = ["delete-account", "drop-table", "reset-all-passwords"];
    if (forbidden.includes(action.params.toolName)) {
      return { type: "reject" };
    }
    return { type: "defer" };
  },
};

// Policy 2: Non-admins need manager approval before sending emails
const emailApproval: Policy<MyContext> = {
  id: "email-approval",
  decider: (ctx, action) => {
    // Only applies to send-email
    if (action.params.toolName !== "send-email") {
      return { type: "defer" };
    }
    // Admins can send freely
    if (ctx.role === "admin") {
      return { type: "approve" };
    }

    // Everyone else needs approval — create a record and notify the manager
    const approvalId = crypto.randomUUID();

    return {
      type: "request",

      // Fire-and-forget: notify the approver
      requestFn: async (callbackId) => {
        // Save the pending approval so we can poll it later
        await db.approvals.create({
          id: approvalId,
          callbackId,
          userId: ctx.userId,
          orgId: ctx.orgId,
          toolName: action.params.toolName,
          toolInput: action.params.toolInput,
          status: "pending",
        });

        // Ping the manager on Slack
        await slack.postMessage({
          channel: "#approvals",
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: [
                  `*Approval requested* by <@${ctx.userId}>`,
                  `> Tool: \`${action.params.toolName}\``,
                  `> Recipient: \`${action.params.toolInput.to}\``,
                  `> Subject: ${action.params.toolInput.subject}`,
                ].join("\n"),
              },
            },
            {
              type: "actions",
              elements: [
                { type: "button", text: { type: "plain_text", text: "Approve" }, value: approvalId, action_id: "approve" },
                { type: "button", text: { type: "plain_text", text: "Deny" }, value: approvalId, action_id: "deny", style: "danger" },
              ],
            },
          ],
        });
      },

      // Poll until the manager clicks a button
      conditionFn: async () => {
        const record = await db.approvals.findById(approvalId);
        if (record.status === "pending") return null; // keep waiting
        return {
          approved: record.status === "approved",
          reason: record.reason,
        };
      },
    };
  },
};
```

The manager sees a Slack message with the tool name, recipient, and subject line. They click **Approve** or **Deny**. Your Slack bot handler writes the decision to the database. The executor's polling picks it up on the next tick and the workflow either continues or fails with an `AuthorizationError`.

Now wire them both up:

```ts
const result = await executeWorkflow(compiled.workflow, {
  tools,
  policies: [blocklist, emailApproval],
  executionContext: { userId: "u_42", role: "member", orgId: "org_7" },
});
```

Order matters. `blocklist` runs first — if the tool is forbidden, execution stops immediately and `emailApproval` never sees it. For everything else, `blocklist` defers and `emailApproval` gets its turn. If both defer (say, for a harmless `lookup-contact` call), the action is approved by default.

The `executionContext` is yours to define. User ID, org ID, role, permissions, session data, feature flags — whatever your policies need to make decisions. It's passed to every policy's `decider` function alongside the action.

## Approval Requests

`approve`, `reject`, and `defer` are instantaneous. The interesting one is `request` — it pauses the workflow and waits for a human (or external system) to weigh in.

A `request` decision needs at least one of two things:

- **`requestFn`** — a fire-and-forget function that triggers the approval request (sends a Slack message, creates a ticket, pings a webhook)
- **`conditionFn`** — a polling function that checks whether a decision has been made

You can provide both, just `conditionFn` (for pure polling), or just `requestFn` (if you're using [durable execution callbacks](#callbacks-and-durable-execution)).

### Polling for Approval

The simplest pattern: send a notification, then poll until someone responds.

```ts
const requireManagerApproval: Policy<MyContext> = {
  id: "require-manager-approval",
  decider: (ctx, action) => {
    if (action.params.toolName !== "send-campaign") {
      return { type: "defer" };
    }

    // Create a pending approval record
    const approvalId = createApprovalRecord({
      userId: ctx.userId,
      action: action.params.toolName,
      input: action.params.toolInput,
    });

    return {
      type: "request",

      // Notify the approver
      requestFn: async (callbackId) => {
        await slack.postMessage({
          channel: "#approvals",
          text: `Workflow wants to send a campaign. Approve?`,
          metadata: { approvalId, callbackId },
        });
      },

      // Poll for the decision
      conditionFn: async () => {
        const record = await db.approvals.findById(approvalId);
        if (record.status === "pending") return null; // still waiting
        return {
          approved: record.status === "approved",
          reason: record.reason,
        };
      },
    };
  },
};
```

When `conditionFn` returns `null`, the executor keeps polling. When it returns an `ApprovalRequestDecision`, the workflow either continues or fails:

```ts
type ApprovalRequestDecision = {
  approved: boolean;
  reason?: string;
  details?: Record<string, unknown>;
};
```

### Polling Configuration

Polling uses exponential backoff so you're not hammering your database while the approver finishes their coffee.

| Option | Default | Description |
|---|---|---|
| `approvalTimeoutMs` | 3 days | How long to wait before treating silence as rejection |
| `approvalIntervalMs` | 2 seconds | Initial polling interval |
| `approvalBackoffMultiplier` | 1.1 | Multiplier applied after each poll |
| `approvalMaxIntervalMs` | 1 hour | Ceiling on the polling interval |

```ts
const result = await executeWorkflow(compiled.workflow, {
  tools,
  policies: [requireManagerApproval],
  executionContext: { userId: "u_42", role: "member" },
  approvalTimeoutMs: 86_400_000,      // 1 day
  approvalIntervalMs: 5_000,          // Start at 5 seconds
  approvalBackoffMultiplier: 1.5,     // Grow faster
  approvalMaxIntervalMs: 300_000,     // Cap at 5 minutes
});
```

If the timeout expires without a decision, the action is treated as rejected.

## Staleness Detection

Here's a subtle problem: a workflow runs, requests approval, and the approver doesn't respond. The workflow times out and fails. Someone fixes the issue and re-runs the workflow. Now the approver clicks "Approve" on the *original* request. Without staleness detection, that stale approval could interfere with the new run.

The `staleFn` callback prevents this. It runs before each `conditionFn` poll. If it returns `{ stale: true }`, the approval is immediately treated as a rejection — no need to wait for the timeout.

```ts
return {
  type: "request",

  conditionFn: async () => {
    const record = await db.approvals.findById(approvalId);
    if (record.status === "pending") return null;
    return { approved: record.status === "approved" };
  },

  staleFn: async () => {
    const record = await db.approvals.findById(approvalId);
    if (record.workflowRunId !== currentRunId) {
      return { stale: true, reason: "Approval belongs to a previous run" };
    }
    return { stale: false };
  },
};
```

## Cleanup with `onApproval`

Sometimes you need to clean up after a decision is reached — dismiss a Slack message, close a ticket, update a dashboard. The `onApproval` callback fires when a decision is made, whether the action was approved or denied:

```ts
return {
  type: "request",

  requestFn: async (callbackId) => {
    await slack.postMessage({
      channel: "#approvals",
      text: "Approve this workflow action?",
      metadata: { callbackId },
    });
  },

  conditionFn: async () => { /* ... */ },

  onApproval: async (decision) => {
    await slack.updateMessage({
      channel: "#approvals",
      text: decision.approved
        ? "Approved by reviewer."
        : `Denied: ${decision.reason}`,
    });
  },
};
```

## Callbacks and Durable Execution

Polling works, but it's not free — your process stays alive burning compute while it waits. In serverless or durable execution environments, you can do better.

If your `DurableContext` implements `waitForCallback`, the executor can park the workflow with zero compute cost and resume when the callback arrives. This is the pattern used by AWS Lambda Durable, Temporal, Inngest, and similar frameworks.

When `waitForCallback` is available and you provide both `requestFn` and `conditionFn`, the executor races them:

1. `requestFn` fires, sending the `callbackId` to your approval system
2. `waitForCallback` suspends the workflow, waiting for a callback with that ID
3. `conditionFn` polls in parallel as a fallback

Whichever resolves first wins. This gives you the efficiency of event-driven callbacks with the reliability of polling as a safety net.

```ts
const result = await executeWorkflow(compiled.workflow, {
  tools,
  policies: [requireManagerApproval],
  executionContext: { userId: "u_42", role: "member" },
  context: myDurableContext, // implements waitForCallback
});
```

If you only provide `requestFn` (no `conditionFn`), the executor relies entirely on `waitForCallback`. If `waitForCallback` isn't available in that case, the executor throws — there's no way to receive the approval.

## Observing Approval State

The policy system emits [execution state deltas](/guide/execution-state) so you can track approvals in real time:

| Delta | When | Step Status |
|---|---|---|
| `step-awaiting-approval` | Approval requested | `awaiting-approval` |
| `step-approved` | Approval granted | `running` |
| `step-denied` | Approval denied or timed out | `failed` |

Each delta includes the `sourcePolicyId` (derived from the policy's `id` field), so you know which policy triggered it:

```ts
const result = await executeWorkflow(compiled.workflow, {
  tools,
  policies: [requireManagerApproval],
  executionContext: { userId: "u_42", role: "member" },
  onStateChange: (state, delta) => {
    if (delta.type === "step-awaiting-approval") {
      console.log(`Step "${delta.stepId}" waiting on policy "${delta.sourcePolicyId}"`);
    }
    if (delta.type === "step-approved") {
      console.log(`Step "${delta.stepId}" approved — resuming`);
    }
    if (delta.type === "step-denied") {
      console.log(`Step "${delta.stepId}" denied: ${delta.reason}`);
    }
  },
});
```

When a step is denied, the executor throws an `AuthorizationError`:

```ts
import { AuthorizationError } from "@remoraflow/core";

if (!result.success && result.error instanceof AuthorizationError) {
  console.log(result.error.code);           // "POLICY_DENIED"
  console.log(result.error.sourcePolicyId); // "require-manager-approval"
  console.log(result.error.reason);         // "Budget not approved"
}
```

## Policy Composition

Policies compose naturally because of the evaluation model. You can layer concerns without any one policy knowing about the others:

```ts
const policies = [
  blocklistPolicy,           // Hard deny for forbidden tools
  rateLimitPolicy,           // Reject if too many calls today
  requireApprovalForPII,     // Human approval for PII-touching tools
  auditLogPolicy,            // Always defers, but logs the action
];
```

Because `approve` and `reject` short-circuit, ordering matters. Put your hard denials first, your approval gates in the middle, and your observability-only policies last.

A few patterns that work well in practice:

### Role-Based Access Control

```ts
const rbacPolicy: Policy<MyContext> = {
  id: "rbac",
  decider: (ctx, action) => {
    const allowed = permissions[ctx.role]?.includes(action.params.toolName);
    if (allowed) return { type: "approve" };
    return { type: "reject" };
  },
};
```

### Tool-Specific Approval Gates

```ts
const sensitiveTools = new Set(["transfer-funds", "delete-account", "send-blast"]);

const sensitiveToolGate: Policy<MyContext> = {
  id: "sensitive-tool-gate",
  decider: (ctx, action) => {
    if (!sensitiveTools.has(action.params.toolName)) {
      return { type: "defer" };
    }
    return {
      type: "request",
      requestFn: async (callbackId) => {
        await notifyApprovers(ctx, action, callbackId);
      },
      conditionFn: async () => checkApprovalStatus(action),
    };
  },
};
```

### Spend Limits

```ts
const spendPolicy: Policy<MyContext> = {
  id: "spend-limit",
  decider: (ctx, action) => {
    if (action.params.toolName !== "charge-card") {
      return { type: "defer" };
    }
    const amount = action.params.toolInput.amount as number;
    if (amount <= 100) {
      return { type: "approve" };
    }
    if (amount <= 10_000) {
      return {
        type: "request",
        conditionFn: () => pollManagerApproval(ctx, amount),
      };
    }
    return { type: "reject" };
  },
};
```

## API Reference

### `Policy<ExecutionContext, ApprovalRequestDecisionDetails>`

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique identifier for the policy |
| `decider` | `(ctx, action) => PolicyDecision` | Evaluates the action and returns a decision |

### `PolicyDecision`

Returned by a policy's `decider` function. You don't need to set `sourcePolicyId` — the executor fills it in automatically from the policy's `id`.

| Field | Type | Description |
|---|---|---|
| `type` | `"approve" \| "reject" \| "defer" \| "request"` | The decision type |
| `requestFn?` | `(callbackId: string) => void` | Triggers the approval request (for `request` type) |
| `conditionFn?` | `() => null \| ApprovalRequestDecision` | Polls for approval (for `request` type) |
| `staleFn?` | `() => StaleCheckResult` | Checks if the request is outdated (for `request` type) |
| `onApproval?` | `(decision) => void` | Called when a decision is reached (for `request` type) |

### `ApprovableAction`

| Field | Type | Description |
|---|---|---|
| `type` | `"tool-call"` | Only tool calls are subject to policies |
| `params.toolName` | `string` | The tool being called |
| `params.toolInput` | `Record<string, unknown>` | Resolved input parameters |

### `ApprovalRequestDecision`

| Field | Type | Description |
|---|---|---|
| `approved` | `boolean` | Whether the action was approved |
| `reason?` | `string` | Human-readable reason for the decision |
| `details?` | `Record<string, unknown>` | Additional app-defined details |

### `AuthorizationError`

| Field | Type | Description |
|---|---|---|
| `code` | `"POLICY_DENIED"` | Error code |
| `category` | `"authorization"` | Error category |
| `sourcePolicyId` | `string` | Which policy denied the action |
| `reason` | `string` | Why the action was denied |
| `stepId` | `string` | The step that was blocked |

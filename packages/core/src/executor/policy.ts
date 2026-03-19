// ─── Approvable Actions ─────────────────────────────────────────

/** Describes a tool-call action that can be evaluated by policies. */
export type ApprovableAction = {
  type: "tool-call";
  params: {
    toolName: string;
    toolInput: Record<string, unknown>;
  };
};

// ─── Approval Request Decision ──────────────────────────────────

/** The result of an external approval request (e.g. human review). */
export type ApprovalRequestDecision<
  ApprovalRequestDecisionDetails extends Record<string, unknown> = Record<
    string,
    unknown
  >,
> = {
  approved: boolean;
  reason?: string;
  details?: ApprovalRequestDecisionDetails;
};

// ─── Stale Check ────────────────────────────────────────────────

/** Result of a staleness check on an approval request. */
export type StaleCheckResult = {
  stale: boolean;
  reason?: string;
};

// ─── Approval Condition Function ─────────────────────────────────

/** Polling function for approval requests. */
export type ApprovalConditionFn<
  ApprovalRequestDecisionDetails extends Record<string, unknown> = Record<
    string,
    unknown
  >,
> = () =>
  | null
  | Promise<null>
  | ApprovalRequestDecision<ApprovalRequestDecisionDetails>
  | Promise<ApprovalRequestDecision<ApprovalRequestDecisionDetails> | null>;

// ─── Approval Request Function ──────────────────────────────────

/** Fire-and-forget function to trigger an approval request. */
export type ApprovalRequestFn = (callbackId: string) => void | Promise<void>;

// ─── Common Request Fields ──────────────────────────────────────

type RequestDecisionBase<
  ApprovalRequestDecisionDetails extends Record<string, unknown> = Record<
    string,
    unknown
  >,
> = {
  type: "request";
  /**
   * Optional staleness check called before each `conditionFn` poll.
   * If the request is stale (e.g. workflow was re-run, approval is outdated),
   * the approval is treated as a rejection. This prevents old approvals from
   * interfering with newer workflow runs.
   */
  staleFn?: () => StaleCheckResult | Promise<StaleCheckResult>;
  /**
   * Optional callback invoked when an approval decision is reached (approved or denied).
   * Useful for cleaning up listeners or updating external state.
   */
  onApproval?: (
    decision: ApprovalRequestDecision<ApprovalRequestDecisionDetails>,
  ) => void | Promise<void>;
};

/**
 * At least one of `requestFn` or `conditionFn` must be provided:
 *
 * - **Both**: Notification is sent via `requestFn`, and `conditionFn` is polled.
 *   If `DurableContext.waitForCallback` is available, event-based and polling
 *   race concurrently — whichever resolves first wins.
 * - **`conditionFn` only**: Polling-only mode. No notification is sent.
 * - **`requestFn` only**: Event-based only via `DurableContext.waitForCallback`.
 *   Requires a durable context with `waitForCallback`; without one, the executor
 *   throws since there is no way to receive the approval.
 */
type RequestDecisionFns<
  ApprovalRequestDecisionDetails extends Record<string, unknown> = Record<
    string,
    unknown
  >,
> =
  | {
      /** Trigger the approval request. Receives the callback ID for routing responses. */
      requestFn: ApprovalRequestFn;
      /**
       * Condition check polled with backoff. Return `null` while pending,
       * non-null {@link ApprovalRequestDecision} when decided.
       */
      conditionFn: ApprovalConditionFn<ApprovalRequestDecisionDetails>;
    }
  | {
      requestFn?: undefined;
      /** Condition check polled with backoff. Return `null` while pending,
       * non-null {@link ApprovalRequestDecision} when decided. */
      conditionFn: ApprovalConditionFn<ApprovalRequestDecisionDetails>;
    }
  | {
      /** Trigger the approval request. Receives the callback ID for routing responses.
       * Requires `DurableContext.waitForCallback` to be available. */
      requestFn: ApprovalRequestFn;
      conditionFn?: undefined;
    };

// ─── Policy Decision ────────────────────────────────────────────

/**
 * The result of a policy evaluation. Each decision carries the
 * `sourcePolicyId` of the policy that produced it.
 *
 * - `approve` — action can definitely proceed, no further policies are checked.
 * - `reject` — action is denied, no further policies are checked.
 * - `defer` — this policy has no opinion; consult the next policy.
 * - `request` — external approval is required. At least one of `requestFn`
 *   or `conditionFn` must be provided. See {@link RequestDecisionFns} for
 *   the valid combinations.
 */
export type PolicyDecision<
  ApprovalRequestDecisionDetails extends Record<string, unknown> = Record<
    string,
    unknown
  >,
> = {
  sourcePolicyId: string;
} & (
  | { type: "approve" }
  | { type: "reject" }
  | { type: "defer" }
  | (RequestDecisionBase<ApprovalRequestDecisionDetails> &
      RequestDecisionFns<ApprovalRequestDecisionDetails>)
);

// ─── Policy ─────────────────────────────────────────────────────

/**
 * A policy that evaluates whether an action should be allowed, denied,
 * deferred to the next policy, or requires external approval.
 *
 * Policies are evaluated in order. Evaluation short-circuits on `approve`,
 * `reject`, or `request`. If all policies return `defer`, the action is
 * approved by default.
 *
 * @typeParam ExecutionContext - App-defined context passed to the decider
 *   (e.g. user, organization, session).
 * @typeParam ApprovalRequestDecisionDetails - App-defined details attached
 *   to approval decisions.
 */
export type Policy<
  ExecutionContext extends Record<string, unknown> = Record<string, unknown>,
  ApprovalRequestDecisionDetails extends Record<string, unknown> = Record<
    string,
    unknown
  >,
> = {
  id: string;
  decider: (
    executionContext: ExecutionContext,
    action: ApprovableAction,
  ) =>
    | PolicyDecision<ApprovalRequestDecisionDetails>
    | Promise<PolicyDecision<ApprovalRequestDecisionDetails>>;
};

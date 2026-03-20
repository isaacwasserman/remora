import type { Agent, LanguageModel, ToolSet } from "ai";
import type { WorkflowStep } from "../types";
import type { WorkflowExecutionStateChannel } from "./channel";
import type { DurableContext } from "./context";
import type { ErrorCode } from "./errors";
import { ExternalServiceError, type StepExecutionError } from "./errors";
import type { Policy } from "./policy";
import type {
  ExecutionDelta,
  ExecutionPathSegment,
  ExecutionState,
  RetryRecord,
  TraceEntry,
} from "./state";
import { applyDelta, snapshotError } from "./state";

// ─── Public Types ────────────────────────────────────────────────

/** The result of executing a workflow. */
export interface ExecutionResult {
  /** Whether the workflow completed without errors. */
  success: boolean;
  /** Map of step ID to that step's output value. */
  stepOutputs: Record<string, unknown>;
  /** The workflow's final output (from the `end` step's output expression), if any. */
  output?: unknown;
  /** The error that caused execution to fail, if `success` is `false`. */
  error?: StepExecutionError;
  /** The final execution state snapshot after the run completes. */
  executionState: ExecutionState;
}

export interface ExecutorLimits {
  /** Max wall-clock time from start to finish, including sleeps/waits. @see {@link DEFAULT_EXECUTOR_LIMITS} */
  maxTotalMs?: number;
  /** Max active execution time (inside step() + checkFn, excluding sleeps/waits). @see {@link DEFAULT_EXECUTOR_LIMITS} */
  maxActiveMs?: number;
  /** Soft cap on sleep durationMs and wait intervalMs. Clamped silently. @see {@link DEFAULT_EXECUTOR_LIMITS} */
  maxSleepMs?: number;
  /** Soft cap on wait-for-condition maxAttempts. Clamped silently. @see {@link DEFAULT_EXECUTOR_LIMITS} */
  maxAttempts?: number;
  /** Soft cap on backoffMultiplier upper bound. Clamped silently. @see {@link DEFAULT_EXECUTOR_LIMITS} */
  maxBackoffMultiplier?: number;
  /** Soft cap on backoffMultiplier lower bound. Clamped silently. @see {@link DEFAULT_EXECUTOR_LIMITS} */
  minBackoffMultiplier?: number;
  /** Soft cap on wait-for-condition timeoutMs. Clamped silently. @see {@link DEFAULT_EXECUTOR_LIMITS} */
  maxTimeoutMs?: number;
  /** Byte threshold above which extract-data uses probe mode instead of inline data. @see {@link DEFAULT_EXECUTOR_LIMITS} */
  probeThresholdBytes?: number;
  /** Maximum bytes returned per probe-data call. @see {@link DEFAULT_EXECUTOR_LIMITS} */
  probeResultMaxBytes?: number;
  /** Maximum probe steps for extract-data probe mode. @see {@link DEFAULT_EXECUTOR_LIMITS} */
  probeMaxSteps?: number;
}

/** Options for {@link executeWorkflow}. */
export interface ExecuteWorkflowOptions<
  ExecutionContext extends Record<string, unknown> = Record<string, unknown>,
  ApprovalRequestDecisionDetails extends Record<string, unknown> = Record<
    string,
    unknown
  >,
> {
  /** Tool definitions. Every tool referenced by a `tool-call` step must be present with an `execute` function. */
  tools: ToolSet;
  /** An AI SDK `LanguageModel` for `llm-prompt`, `extract-data`, and `agent-loop` steps. Required if the workflow contains LLM steps. */
  model?: LanguageModel;
  /** An AI SDK `Agent` to use for `agent-loop` steps. When provided, agent-loop steps use the Agent's own tools
   *  and describe the expected output shape in the prompt. The bare `model` is then used to coerce the Agent's
   *  text output into the structured format. Only applies to `agent-loop` steps. */
  // biome-ignore lint/suspicious/noExplicitAny: Agent generic params are irrelevant here
  agent?: Agent<any, any, any>;
  /** Input values passed to the workflow's `start` step. Validated against the start step's `inputSchema`. */
  inputs?: Record<string, unknown>;
  /** Maximum number of retries for recoverable errors (rate limits, network errors, parse failures). Defaults to 3. */
  maxRetries?: number;
  /** Base delay in milliseconds for exponential backoff between retries. Defaults to 1000. */
  retryDelayMs?: number;
  /** Called when a step begins execution. */
  onStepStart?: (stepId: string, step: WorkflowStep) => void;
  /** Called when a step completes successfully. */
  onStepComplete?: (stepId: string, output: unknown) => void;
  /** Called on every state transition with the full execution state and the idempotent delta that produced it. */
  onStateChange?: (state: ExecutionState, delta: ExecutionDelta) => void;
  /** Optional channel for publishing execution state snapshots. Publishes on every state transition, in addition to {@link onStateChange}. */
  channel?: WorkflowExecutionStateChannel;
  /** Injectable durable execution context. Default: simple in-process implementation. */
  context?: DurableContext;
  /** Execution limits for sleep/wait/timeout bounds. */
  limits?: ExecutorLimits;
  /** Previous execution state to resume from. When provided, completed steps are skipped and execution continues from the first incomplete step. */
  initialState?: ExecutionState;
  /** Authorization policies evaluated in order before each tool-call step. When absent, all steps execute freely. */
  policies?: Policy<ExecutionContext, ApprovalRequestDecisionDetails>[];
  /** App-defined execution context passed to policy deciders (e.g. user, organization, session). */
  executionContext?: ExecutionContext;
  /** Timeout in milliseconds for approval requests before treating as rejection. @see {@link DEFAULT_APPROVAL_TIMEOUT_MS} */
  approvalTimeoutMs?: number;
  /** Initial polling interval in milliseconds for approval condition checks. @see {@link DEFAULT_APPROVAL_INTERVAL_MS} */
  approvalIntervalMs?: number;
  /** Backoff multiplier applied to the polling interval after each attempt. @see {@link DEFAULT_APPROVAL_BACKOFF_MULTIPLIER} */
  approvalBackoffMultiplier?: number;
  /** Maximum polling interval in milliseconds. The interval will never grow beyond this. @see {@link DEFAULT_APPROVAL_MAX_INTERVAL_MS} */
  approvalMaxIntervalMs?: number;
}

// ─── Internal Types ──────────────────────────────────────────────

export type Expression =
  | { type: "literal"; value: unknown }
  | { type: "jmespath"; expression: string }
  | { type: "template"; template: string };

/**
 * Internal resolved options. Currently identical to the public options
 * but kept as a separate type for future internal-only fields.
 */
export type ResolvedExecuteWorkflowOptions = ExecuteWorkflowOptions;

/**
 * Callback type for `executeChain`, injected into structural steps
 * (switch-case, for-each, wait-for-condition) to avoid circular imports.
 */
export type ExecuteChainFn = (
  startStepId: string,
  stepIndex: Map<string, WorkflowStep>,
  stepOutputs: Record<string, unknown>,
  loopVars: Record<string, unknown>,
  options: ResolvedExecuteWorkflowOptions,
  context: DurableContext,
  timer: ExecutionTimer | undefined,
  stateManager: ExecutionStateManager | undefined,
  execPath: ExecutionPathSegment[],
  resumeSkipSteps?: Set<string>,
) => Promise<unknown>;

// ─── Execution Timer ─────────────────────────────────────────────

export const DEFAULT_EXECUTOR_LIMITS: Required<ExecutorLimits> = {
  maxTotalMs: 600_000, // 10 minutes
  maxActiveMs: 300_000, // 5 minutes
  maxSleepMs: 300_000, // 5 minutes
  maxAttempts: Number.POSITIVE_INFINITY,
  maxBackoffMultiplier: 2,
  minBackoffMultiplier: 1,
  maxTimeoutMs: 600_000, // 10 minutes
  probeThresholdBytes: 50_000, // 50KB
  probeResultMaxBytes: 10_000, // 10KB
  probeMaxSteps: 10,
};

export class ExecutionTimer {
  private readonly startTime = Date.now();
  private activeMs = 0;
  private activeStart: number | null = null;
  private readonly limits: Required<ExecutorLimits>;

  constructor(limits?: ExecutorLimits) {
    this.limits = { ...DEFAULT_EXECUTOR_LIMITS, ...limits };
  }

  get resolvedLimits(): Required<ExecutorLimits> {
    return this.limits;
  }

  /** Call before entering active work (step execution, condition check). */
  beginActive(): void {
    this.activeStart = Date.now();
  }

  /** Call after active work completes. Checks active timeout. */
  endActive(stepId: string): void {
    if (this.activeStart !== null) {
      this.activeMs += Date.now() - this.activeStart;
      this.activeStart = null;
    }
    if (this.activeMs > this.limits.maxActiveMs) {
      throw new ExternalServiceError(
        stepId,
        "EXECUTION_ACTIVE_TIMEOUT" as ErrorCode,
        `Active execution time ${this.activeMs}ms exceeded limit of ${this.limits.maxActiveMs}ms`,
        undefined,
        undefined,
        false,
      );
    }
  }

  /** Check total wall-clock timeout before starting a step. */
  checkTotal(stepId: string): void {
    const elapsed = Date.now() - this.startTime;
    if (elapsed > this.limits.maxTotalMs) {
      throw new ExternalServiceError(
        stepId,
        "EXECUTION_TOTAL_TIMEOUT" as ErrorCode,
        `Total execution time ${elapsed}ms exceeded limit of ${this.limits.maxTotalMs}ms`,
        undefined,
        undefined,
        false,
      );
    }
  }
}

// ─── Execution State Manager ─────────────────────────────────────

export class ExecutionStateManager {
  private state: ExecutionState;
  private readonly onChange?: (
    state: ExecutionState,
    delta: ExecutionDelta,
  ) => void;

  constructor(
    onChange?: (state: ExecutionState, delta: ExecutionDelta) => void,
    initialState?: ExecutionState,
    workflowHash?: string,
  ) {
    this.state = initialState ?? {
      runId: crypto.randomUUID(),
      status: "pending",
      startedAt: new Date().toISOString(),
      stepRecords: [],
      workflowHash,
    };
    this.onChange = onChange;
  }

  get currentState(): ExecutionState {
    return this.state;
  }

  private emit(delta: ExecutionDelta): void {
    this.state = applyDelta(this.state, delta);
    this.onChange?.(this.state, delta);
  }

  runStarted(): void {
    this.emit({
      type: "run-started",
      runId: this.state.runId,
      startedAt: this.state.startedAt,
    });
  }

  stepStarted(stepId: string, path: ExecutionPathSegment[]): void {
    this.emit({
      type: "step-started",
      stepId,
      path,
      startedAt: new Date().toISOString(),
    });
  }

  stepCompleted(
    stepId: string,
    path: ExecutionPathSegment[],
    output: unknown,
    durationMs: number,
    resolvedInputs?: unknown,
    trace?: TraceEntry[],
  ): void {
    this.emit({
      type: "step-completed",
      stepId,
      path,
      completedAt: new Date().toISOString(),
      durationMs,
      output,
      resolvedInputs,
      trace,
    });
  }

  stepFailed(
    stepId: string,
    path: ExecutionPathSegment[],
    error: StepExecutionError,
    durationMs: number,
    resolvedInputs?: unknown,
  ): void {
    this.emit({
      type: "step-failed",
      stepId,
      path,
      failedAt: new Date().toISOString(),
      durationMs,
      error: snapshotError(error),
      resolvedInputs,
    });
  }

  retryAttempted(
    stepId: string,
    path: ExecutionPathSegment[],
    retry: RetryRecord,
  ): void {
    this.emit({
      type: "step-retry",
      stepId,
      path,
      retry,
    });
  }

  runCompleted(output?: unknown): void {
    const startMs = new Date(this.state.startedAt).getTime();
    this.emit({
      type: "run-completed",
      runId: this.state.runId,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startMs,
      output,
    });
  }

  runFailed(error: StepExecutionError): void {
    const startMs = new Date(this.state.startedAt).getTime();
    this.emit({
      type: "run-failed",
      runId: this.state.runId,
      failedAt: new Date().toISOString(),
      durationMs: Date.now() - startMs,
      error: snapshotError(error),
    });
  }

  stepAwaitingApproval(
    stepId: string,
    path: ExecutionPathSegment[],
    sourcePolicyId: string,
  ): void {
    this.emit({
      type: "step-awaiting-approval",
      stepId,
      path,
      sourcePolicyId,
      requestedAt: new Date().toISOString(),
    });
  }

  stepApproved(
    stepId: string,
    path: ExecutionPathSegment[],
    sourcePolicyId: string,
  ): void {
    this.emit({
      type: "step-approved",
      stepId,
      path,
      sourcePolicyId,
      approvedAt: new Date().toISOString(),
    });
  }

  stepDenied(
    stepId: string,
    path: ExecutionPathSegment[],
    sourcePolicyId: string,
    reason?: string,
  ): void {
    this.emit({
      type: "step-denied",
      stepId,
      path,
      sourcePolicyId,
      deniedAt: new Date().toISOString(),
      reason,
    });
  }
}

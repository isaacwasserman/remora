import type { WorkflowDefinition, WorkflowStep } from "../types";
import { MemoryExecutionStateChannel } from "./channel";
import { createDefaultDurableContext, type DurableContext } from "./context";
import {
  AuthorizationError,
  ConfigurationError,
  ExternalServiceError,
  StepExecutionError,
  ValidationError,
} from "./errors";
import {
  type ExecuteChainFn,
  type ExecuteWorkflowOptions,
  type ExecutionResult,
  ExecutionStateManager,
  ExecutionTimer,
  type ResolvedExecuteWorkflowOptions,
} from "./executor-types";
import { hashWorkflow } from "./hash";
import type { ApprovableAction } from "./policy";
import type { ExecutionPathSegment, ExecutionState, TraceEntry } from "./state";

export type {
  WorkflowExecutionStateChannel,
  WorkflowExecutionStateChannelOptions,
} from "./channel";
export {
  BaseExecutionStateChannel,
  MemoryExecutionStateChannel,
} from "./channel";
export type {
  ExecuteWorkflowOptions,
  ExecutionResult,
  ExecutorLimits,
} from "./executor-types";

// ─── Step Imports ────────────────────────────────────────────────

import { executeAgentLoop, resolveAgentLoopInputs } from "./steps/agent-loop";
import { executeEnd } from "./steps/end";
import {
  executeExtractData,
  resolveExtractDataInputs,
} from "./steps/extract-data";
import { executeForEach, resolveForEachInputs } from "./steps/for-each";
import { executeLlmPrompt, resolveLlmPromptInputs } from "./steps/llm-prompt";
import { executeSleep } from "./steps/sleep";
import { executeStart } from "./steps/start";
import {
  executeSwitchCase,
  resolveSwitchCaseInputs,
} from "./steps/switch-case";
import { executeToolCall, resolveToolCallInputs } from "./steps/tool-call";
import { executeWaitForCondition } from "./steps/wait-for-condition";

// ─── Policy Evaluation ───────────────────────────────────────────

export const DEFAULT_APPROVAL_TIMEOUT_MS = 259_200_000; // 3 days
export const DEFAULT_APPROVAL_INTERVAL_MS = 2_000; // 2 seconds
export const DEFAULT_APPROVAL_BACKOFF_MULTIPLIER = 1.1;
export const DEFAULT_APPROVAL_MAX_INTERVAL_MS = 3_600_000; // 1 hour

/**
 * Evaluate policies in order for a tool-call action. Short-circuits on
 * `approve`, `reject`, or `request`. If all policies defer, the action
 * is approved by default.
 */
async function evaluatePolicies(
  action: ApprovableAction,
  stepId: string,
  options: ResolvedExecuteWorkflowOptions,
  context: DurableContext,
  stateManager?: ExecutionStateManager,
  execPath: ExecutionPathSegment[] = [],
): Promise<void> {
  const policies = options.policies;
  if (!policies || policies.length === 0) return;

  const executionContext = options.executionContext ?? {};

  for (const policy of policies) {
    const decision = await policy.decider(executionContext, action);

    switch (decision.type) {
      case "approve":
        return;

      case "reject":
        throw new AuthorizationError(
          stepId,
          "Action rejected by policy",
          decision.sourcePolicyId,
        );

      case "defer":
        continue;

      case "request": {
        stateManager?.stepAwaitingApproval(
          stepId,
          execPath,
          decision.sourcePolicyId,
        );

        const timeoutMs =
          options.approvalTimeoutMs ?? DEFAULT_APPROVAL_TIMEOUT_MS;
        const intervalMs =
          options.approvalIntervalMs ?? DEFAULT_APPROVAL_INTERVAL_MS;
        const backoffMultiplier =
          options.approvalBackoffMultiplier ??
          DEFAULT_APPROVAL_BACKOFF_MULTIPLIER;
        const maxIntervalMs =
          options.approvalMaxIntervalMs ?? DEFAULT_APPROVAL_MAX_INTERVAL_MS;

        // Generate a synthetic callback ID for polling-only mode.
        // In durable environments with waitForCallback, the environment
        // provides its own callback ID via the submitter.
        const syntheticCallbackId = `approval:${stateManager?.currentState.runId ?? "unknown"}:${stepId}`;

        const hasConditionFn = !!decision.conditionFn;
        const hasRequestFn = !!decision.requestFn;

        // requestFn-only requires waitForCallback
        if (hasRequestFn && !hasConditionFn && !context.waitForCallback) {
          throw new AuthorizationError(
            stepId,
            "Policy returned requestFn without conditionFn, but no DurableContext.waitForCallback is available",
            decision.sourcePolicyId,
          );
        }

        // Fire the notification (if provided) with the callback ID.
        // When waitForCallback is available, requestFn is called inside the
        // submitter (see below) with the environment-provided callback ID.
        if (hasRequestFn && !context.waitForCallback) {
          await decision.requestFn(syntheticCallbackId);
        }

        let approvalResult: unknown;
        try {
          // Build the polling promise (if conditionFn is provided)
          const pollingPromise = hasConditionFn
            ? (async () => {
                const deadline = Date.now() + timeoutMs;
                let delay = intervalMs;

                while (true) {
                  // Check staleness before checking condition
                  if (decision.staleFn) {
                    const staleCheck = await decision.staleFn();
                    if (staleCheck.stale) {
                      return {
                        approved: false,
                        reason:
                          staleCheck.reason ?? "Approval request is stale",
                      };
                    }
                  }

                  const result = await decision.conditionFn();
                  if (result) return result;

                  if (Date.now() + delay > deadline) {
                    throw new Error("timeout");
                  }

                  await context.sleep(`approval:${stepId}:poll`, delay);
                  delay = Math.min(delay * backoffMultiplier, maxIntervalMs);
                }
              })()
            : null;

          // Build the callback promise (if waitForCallback is available)
          const callbackPromise = context.waitForCallback
            ? context.waitForCallback(
                `approval:${stepId}`,
                async (callbackId) => {
                  if (hasRequestFn) {
                    await decision.requestFn(callbackId);
                  }
                },
                timeoutMs,
              )
            : null;

          // Race whichever promises are available
          if (callbackPromise && pollingPromise) {
            approvalResult = await Promise.race([
              callbackPromise,
              pollingPromise,
            ]);
          } else if (callbackPromise) {
            approvalResult = await callbackPromise;
          } else {
            // pollingPromise is guaranteed non-null here (validated above)
            approvalResult = await pollingPromise;
          }
        } catch {
          // Timeout — treat as rejection
          stateManager?.stepDenied(
            stepId,
            execPath,
            decision.sourcePolicyId,
            "Approval request timed out",
          );
          throw new AuthorizationError(
            stepId,
            "Approval request timed out",
            decision.sourcePolicyId,
          );
        }

        // Check the decision
        const approvalDecision = approvalResult as {
          approved: boolean;
          reason?: string;
        };

        // Notify via onApproval callback if provided
        if (decision.onApproval) {
          await decision.onApproval(approvalDecision);
        }

        if (approvalDecision.approved) {
          stateManager?.stepApproved(stepId, execPath, decision.sourcePolicyId);
          return;
        }

        stateManager?.stepDenied(
          stepId,
          execPath,
          decision.sourcePolicyId,
          approvalDecision.reason,
        );
        throw new AuthorizationError(
          stepId,
          approvalDecision.reason ?? "Approval denied",
          decision.sourcePolicyId,
        );
      }
    }
  }

  // All policies deferred — action is approved by default
}

// ─── Input Validation ────────────────────────────────────────────

function validateWorkflowInputs(
  inputSchema: Record<string, unknown> | undefined,
  inputs: Record<string, unknown>,
): void {
  if (!inputSchema || typeof inputSchema !== "object") return;

  const required = inputSchema.required;
  if (Array.isArray(required)) {
    const missing = required.filter(
      (key: unknown) => typeof key === "string" && !(key in inputs),
    );
    if (missing.length > 0) {
      throw new ValidationError(
        "input",
        "TOOL_INPUT_VALIDATION_FAILED",
        `Workflow input validation failed: missing required input(s): ${missing.join(", ")}`,
        inputs,
      );
    }
  }

  const properties = inputSchema.properties;
  if (properties && typeof properties === "object") {
    for (const [key, value] of Object.entries(inputs)) {
      const propSchema = (properties as Record<string, unknown>)[key];
      if (
        propSchema &&
        typeof propSchema === "object" &&
        "type" in propSchema
      ) {
        const expectedType = (propSchema as { type: string }).type;
        const actualType = typeof value;
        if (expectedType === "integer" || expectedType === "number") {
          if (actualType !== "number") {
            throw new ValidationError(
              "input",
              "TOOL_INPUT_VALIDATION_FAILED",
              `Workflow input validation failed: input '${key}' expected type '${expectedType}' but got '${actualType}'`,
              inputs,
            );
          }
        } else if (expectedType === "array") {
          if (!Array.isArray(value)) {
            throw new ValidationError(
              "input",
              "TOOL_INPUT_VALIDATION_FAILED",
              `Workflow input validation failed: input '${key}' expected type 'array' but got '${actualType}'`,
              inputs,
            );
          }
        } else if (actualType !== expectedType) {
          throw new ValidationError(
            "input",
            "TOOL_INPUT_VALIDATION_FAILED",
            `Workflow input validation failed: input '${key}' expected type '${expectedType}' but got '${actualType}'`,
            inputs,
          );
        }
      }
    }
  }
}

// ─── Output Validation ──────────────────────────────────────────

function validateWorkflowOutput(
  outputSchema: Record<string, unknown>,
  output: unknown,
  endStepId: string,
): void {
  const expectedType = outputSchema.type;
  if (typeof expectedType === "string") {
    if (
      expectedType === "object" &&
      (typeof output !== "object" || output === null)
    ) {
      throw new ValidationError(
        endStepId,
        "WORKFLOW_OUTPUT_VALIDATION_FAILED",
        `Workflow output validation failed: expected type 'object' but got '${output === null ? "null" : typeof output}'`,
        output,
      );
    }
    if (expectedType === "array" && !Array.isArray(output)) {
      throw new ValidationError(
        endStepId,
        "WORKFLOW_OUTPUT_VALIDATION_FAILED",
        `Workflow output validation failed: expected type 'array' but got '${typeof output}'`,
        output,
      );
    }
    if (
      (expectedType === "string" || expectedType === "boolean") &&
      typeof output !== expectedType
    ) {
      throw new ValidationError(
        endStepId,
        "WORKFLOW_OUTPUT_VALIDATION_FAILED",
        `Workflow output validation failed: expected type '${expectedType}' but got '${typeof output}'`,
        output,
      );
    }
    if (
      (expectedType === "number" || expectedType === "integer") &&
      typeof output !== "number"
    ) {
      throw new ValidationError(
        endStepId,
        "WORKFLOW_OUTPUT_VALIDATION_FAILED",
        `Workflow output validation failed: expected type '${expectedType}' but got '${typeof output}'`,
        output,
      );
    }
  }

  if (typeof output === "object" && output !== null && !Array.isArray(output)) {
    const required = outputSchema.required;
    if (Array.isArray(required)) {
      const missing = required.filter(
        (key: unknown) =>
          typeof key === "string" &&
          !(key in (output as Record<string, unknown>)),
      );
      if (missing.length > 0) {
        throw new ValidationError(
          endStepId,
          "WORKFLOW_OUTPUT_VALIDATION_FAILED",
          `Workflow output validation failed: missing required field(s): ${missing.join(", ")}`,
          output,
        );
      }
    }

    const properties = outputSchema.properties;
    if (properties && typeof properties === "object") {
      for (const [key, value] of Object.entries(
        output as Record<string, unknown>,
      )) {
        const propSchema = (properties as Record<string, unknown>)[key];
        if (
          propSchema &&
          typeof propSchema === "object" &&
          "type" in propSchema
        ) {
          const propExpectedType = (propSchema as { type: string }).type;
          const actualType = typeof value;
          if (propExpectedType === "integer" || propExpectedType === "number") {
            if (actualType !== "number") {
              throw new ValidationError(
                endStepId,
                "WORKFLOW_OUTPUT_VALIDATION_FAILED",
                `Workflow output validation failed: field '${key}' expected type '${propExpectedType}' but got '${actualType}'`,
                output,
              );
            }
          } else if (propExpectedType === "array") {
            if (!Array.isArray(value)) {
              throw new ValidationError(
                endStepId,
                "WORKFLOW_OUTPUT_VALIDATION_FAILED",
                `Workflow output validation failed: field '${key}' expected type 'array' but got '${actualType}'`,
                output,
              );
            }
          } else if (actualType !== propExpectedType) {
            throw new ValidationError(
              endStepId,
              "WORKFLOW_OUTPUT_VALIDATION_FAILED",
              `Workflow output validation failed: field '${key}' expected type '${propExpectedType}' but got '${actualType}'`,
              output,
            );
          }
        }
      }
    }
  }
}

// ─── Resolve Step Inputs (for viewer display) ───────────────────

function resolveStepInputs(
  step: WorkflowStep,
  scope: Record<string, unknown>,
): unknown {
  switch (step.type) {
    case "tool-call":
      return resolveToolCallInputs(step, scope);
    case "llm-prompt":
      return resolveLlmPromptInputs(step, scope);
    case "extract-data":
      return resolveExtractDataInputs(step, scope);
    case "switch-case":
      return resolveSwitchCaseInputs(step, scope);
    case "for-each":
      return resolveForEachInputs(step, scope);
    case "agent-loop":
      return resolveAgentLoopInputs(step, scope);
    default:
      return undefined;
  }
}

// ─── Step Dispatch ───────────────────────────────────────────────

/** Return type for executeStep. LLM steps may attach trace entries for debugging. */
type StepOutput = {
  output: unknown;
  trace?: TraceEntry[];
};

async function executeStep(
  step: WorkflowStep,
  scope: Record<string, unknown>,
  stepIndex: Map<string, WorkflowStep>,
  stepOutputs: Record<string, unknown>,
  loopVars: Record<string, unknown>,
  options: ResolvedExecuteWorkflowOptions,
  context: DurableContext,
  timer: ExecutionTimer,
  stateManager?: ExecutionStateManager,
  execPath: ExecutionPathSegment[] = [],
): Promise<StepOutput> {
  switch (step.type) {
    case "llm-prompt":
      return executeLlmPrompt(step, scope, options);
    case "extract-data":
      return executeExtractData(step, scope, options, timer.resolvedLimits);
    case "agent-loop":
      return executeAgentLoop(step, scope, options, timer.resolvedLimits);
    case "tool-call":
      return { output: await executeToolCall(step, scope, options.tools) };
    case "switch-case":
      return {
        output: await executeSwitchCase(
          step,
          scope,
          stepIndex,
          stepOutputs,
          loopVars,
          options,
          context,
          stateManager,
          execPath,
          executeChain,
        ),
      };
    case "for-each":
      return {
        output: await executeForEach(
          step,
          scope,
          stepIndex,
          stepOutputs,
          loopVars,
          options,
          context,
          stateManager,
          execPath,
          executeChain,
        ),
      };
    case "sleep":
      return { output: await executeSleep(step, scope, context, timer) };
    case "wait-for-condition":
      return {
        output: await executeWaitForCondition(
          step,
          scope,
          stepIndex,
          stepOutputs,
          loopVars,
          options,
          context,
          timer,
          stateManager,
          execPath,
          executeChain,
        ),
      };
    case "start":
      return { output: await executeStart() };
    case "end":
      return { output: await executeEnd(step, scope) };
  }
}

// ─── Error Recovery ──────────────────────────────────────────────

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 1000;

async function retryStep(
  step: WorkflowStep,
  stepIndex: Map<string, WorkflowStep>,
  stepOutputs: Record<string, unknown>,
  loopVars: Record<string, unknown>,
  options: ResolvedExecuteWorkflowOptions,
  originalError: StepExecutionError,
  context: DurableContext,
  timer: ExecutionTimer,
  stateManager?: ExecutionStateManager,
  execPath: ExecutionPathSegment[] = [],
): Promise<StepOutput> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelay = options.retryDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const scope = { ...stepOutputs, ...loopVars };
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const retryStartedAt = new Date().toISOString();
    await context.sleep(
      `${step.id}_retry_${attempt}`,
      baseDelay * 2 ** (attempt - 1),
    );
    try {
      return await executeStep(
        step,
        scope,
        stepIndex,
        stepOutputs,
        loopVars,
        options,
        context,
        timer,
        stateManager,
        execPath,
      );
    } catch (e) {
      stateManager?.retryAttempted(step.id, execPath, {
        attempt,
        startedAt: retryStartedAt,
        failedAt: new Date().toISOString(),
        errorCode: e instanceof StepExecutionError ? e.code : "UNKNOWN",
        errorMessage: e instanceof Error ? e.message : String(e),
      });
      if (attempt === maxRetries) throw originalError;
    }
  }
  throw originalError;
}

async function recoverFromError(
  error: StepExecutionError,
  step: WorkflowStep,
  stepIndex: Map<string, WorkflowStep>,
  stepOutputs: Record<string, unknown>,
  loopVars: Record<string, unknown>,
  options: ResolvedExecuteWorkflowOptions,
  context: DurableContext,
  timer: ExecutionTimer,
  stateManager?: ExecutionStateManager,
  execPath: ExecutionPathSegment[] = [],
): Promise<StepOutput> {
  switch (error.code) {
    case "LLM_RATE_LIMITED":
    case "LLM_NETWORK_ERROR":
    case "LLM_NO_CONTENT":
    case "LLM_OUTPUT_PARSE_ERROR":
      return retryStep(
        step,
        stepIndex,
        stepOutputs,
        loopVars,
        options,
        error,
        context,
        timer,
        stateManager,
        execPath,
      );

    case "LLM_API_ERROR":
      if (error instanceof ExternalServiceError && error.isRetryable) {
        return retryStep(
          step,
          stepIndex,
          stepOutputs,
          loopVars,
          options,
          error,
          context,
          timer,
          stateManager,
          execPath,
        );
      }
      throw error;

    default:
      throw error;
  }
}

// ─── Chain Execution ─────────────────────────────────────────────

// In a durable execution environment, code outside context.step() re-runs
// on every resume. All code in this loop body outside the context.step()
// call must therefore be idempotent: pure reads (stepIndex lookups,
// nextStepId traversal), scope construction, and writing the same cached
// step output back into stepOutputs.
const executeChain: ExecuteChainFn = async function executeChain(
  startStepId: string,
  stepIndex: Map<string, WorkflowStep>,
  stepOutputs: Record<string, unknown>,
  loopVars: Record<string, unknown>,
  options: ResolvedExecuteWorkflowOptions,
  context: DurableContext,
  timer?: ExecutionTimer,
  stateManager?: ExecutionStateManager,
  execPath: ExecutionPathSegment[] = [],
  resumeSkipSteps?: Set<string>,
): Promise<unknown> {
  let currentStepId: string | undefined = startStepId;
  let lastOutput: unknown;

  while (currentStepId) {
    const step = stepIndex.get(currentStepId);
    if (!step) {
      // Defensive: the compiler and pre-flight checks should prevent this
      throw new Error(`Step '${currentStepId}' not found`);
    }

    // Skip steps already completed in a prior run (resumption)
    if (resumeSkipSteps?.has(step.id)) {
      lastOutput = stepOutputs[step.id];
      currentStepId = step.nextStepId;
      continue;
    }

    timer?.checkTotal(step.id);
    const stepStartTime = Date.now();
    stateManager?.stepStarted(step.id, execPath);
    options.onStepStart?.(step.id, step);

    const scope = { ...stepOutputs, ...loopVars };
    const resolvedInputs = stateManager
      ? resolveStepInputs(step, scope)
      : undefined;

    // Policy check for tool-call steps
    if (step.type === "tool-call" && options.policies?.length) {
      const action: ApprovableAction = {
        type: "tool-call",
        params: {
          toolName: step.params.toolName,
          toolInput: (resolvedInputs ?? {}) as Record<string, unknown>,
        },
      };
      await evaluatePolicies(
        action,
        step.id,
        options,
        context,
        stateManager,
        execPath,
      );
    }

    let stepResult: StepOutput;

    try {
      timer?.beginActive();
      try {
        stepResult = (await context.step(step.id, () =>
          executeStep(
            step,
            scope,
            stepIndex,
            stepOutputs,
            loopVars,
            options,
            context,
            timer ?? new ExecutionTimer(),
            stateManager,
            execPath,
          ),
        )) as StepOutput;
      } finally {
        timer?.endActive(step.id);
      }
    } catch (e) {
      if (!(e instanceof StepExecutionError)) {
        const durationMs = Date.now() - stepStartTime;
        const wrappedError = new ExternalServiceError(
          step.id,
          "TOOL_EXECUTION_FAILED",
          e instanceof Error ? e.message : String(e),
          e,
          undefined,
          false,
        );
        stateManager?.stepFailed(
          step.id,
          execPath,
          wrappedError,
          durationMs,
          resolvedInputs,
        );
        throw e;
      }
      try {
        stepResult = await recoverFromError(
          e,
          step,
          stepIndex,
          stepOutputs,
          loopVars,
          options,
          context,
          timer ?? new ExecutionTimer(),
          stateManager,
          execPath,
        );
      } catch (unrecoverable) {
        const durationMs = Date.now() - stepStartTime;
        stateManager?.stepFailed(
          step.id,
          execPath,
          e,
          durationMs,
          resolvedInputs,
        );
        throw unrecoverable;
      }
    }

    const durationMs = Date.now() - stepStartTime;
    stepOutputs[step.id] = stepResult.output;
    lastOutput = stepResult.output;
    stateManager?.stepCompleted(
      step.id,
      execPath,
      stepResult.output,
      durationMs,
      resolvedInputs,
      stepResult.trace,
    );
    options.onStepComplete?.(step.id, stepResult.output);

    currentStepId = step.nextStepId;
  }

  return lastOutput;
};

// ─── Pre-flight Validation ───────────────────────────────────────

function validateWorkflowConfig(
  workflow: WorkflowDefinition,
  options: ResolvedExecuteWorkflowOptions,
): void {
  const needsAgent = workflow.steps.some(
    (s) =>
      s.type === "llm-prompt" ||
      s.type === "extract-data" ||
      s.type === "agent-loop",
  );
  if (needsAgent && !options.model) {
    const llmStep = workflow.steps.find(
      (s) =>
        s.type === "llm-prompt" ||
        s.type === "extract-data" ||
        s.type === "agent-loop",
    );
    throw new ConfigurationError(
      llmStep?.id ?? "unknown",
      "AGENT_NOT_PROVIDED",
      "Workflow contains LLM/agent steps but no agent was provided",
    );
  }

  for (const step of workflow.steps) {
    if (step.type === "tool-call") {
      const toolDef = options.tools[step.params.toolName];
      if (!toolDef) {
        throw new ConfigurationError(
          step.id,
          "TOOL_NOT_FOUND",
          `Tool '${step.params.toolName}' not found`,
        );
      }
      if (!toolDef.execute) {
        throw new ConfigurationError(
          step.id,
          "TOOL_MISSING_EXECUTE",
          `Tool '${step.params.toolName}' has no execute function`,
        );
      }
    }
    if (step.type === "agent-loop" && !options.agent) {
      // When an Agent is provided, tools come from the Agent itself;
      // only validate tool references when using the LanguageModel path
      for (const toolName of step.params.tools) {
        const toolDef = options.tools[toolName];
        if (!toolDef) {
          throw new ConfigurationError(
            step.id,
            "TOOL_NOT_FOUND",
            `Tool '${toolName}' referenced in agent-loop step not found`,
          );
        }
        if (!toolDef.execute) {
          throw new ConfigurationError(
            step.id,
            "TOOL_MISSING_EXECUTE",
            `Tool '${toolName}' referenced in agent-loop step has no execute function`,
          );
        }
      }
    }
  }
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * Executes a compiled workflow by walking its step graph from `initialStepId`.
 *
 * Handles all step types (tool calls, LLM prompts, data extraction, branching,
 * loops) and supports automatic retry with exponential backoff for recoverable
 * errors (rate limits, network failures, LLM parse errors).
 *
 * @param workflow - The workflow definition to execute (should be compiled first via {@link compileWorkflow}).
 * @param options - Execution options including tools, agent, inputs, and callbacks.
 * @returns An {@link ExecutionResult} with success status, all step outputs, and the final workflow output.
 */
export async function executeWorkflow(
  workflow: WorkflowDefinition,
  options: ExecuteWorkflowOptions,
): Promise<ExecutionResult> {
  const stepIndex = new Map<string, WorkflowStep>();
  for (const step of workflow.steps) {
    stepIndex.set(step.id, step);
  }

  const stepOutputs: Record<string, unknown> = {};
  const wfHash = hashWorkflow(workflow);

  // Seed stepOutputs from initial state (completed top-level steps only).
  // If the workflow hash doesn't match, the initial state is stale — ignore it.
  const resumeSkipSteps = new Set<string>();
  const validInitialState =
    options.initialState?.workflowHash === wfHash
      ? options.initialState
      : undefined;
  if (validInitialState) {
    for (const record of validInitialState.stepRecords) {
      if (
        record.status === "completed" &&
        record.path.length === 0 &&
        record.output !== undefined
      ) {
        stepOutputs[record.stepId] = record.output;
        resumeSkipSteps.add(record.stepId);
      }
    }
  }

  const resolvedOptions: ResolvedExecuteWorkflowOptions = options;
  const resolvedContext = options.context ?? createDefaultDurableContext();
  const timer = new ExecutionTimer(options.limits);
  // When resuming, strip non-completed step records so that steps that were
  // in-progress at pause time don't linger as stale "running" entries.
  const cleanedInitialState = validInitialState
    ? {
        ...validInitialState,
        workflowHash: wfHash,
        stepRecords: validInitialState.stepRecords.filter(
          (r) => r.status === "completed",
        ),
      }
    : undefined;
  const combinedOnChange: typeof options.onStateChange = options.channel
    ? (state, delta) => {
        options.channel?.publish(state);
        options.onStateChange?.(state, delta);
      }
    : options.onStateChange;

  const stateManager = new ExecutionStateManager(
    combinedOnChange,
    cleanedInitialState,
    wfHash,
  );
  stateManager.runStarted();

  try {
    validateWorkflowConfig(workflow, resolvedOptions);

    const inputs = options.inputs ?? {};
    validateWorkflowInputs(
      workflow.inputSchema as Record<string, unknown> | undefined,
      inputs,
    );
    stepOutputs.input = inputs;

    const chainOutput = await executeChain(
      workflow.initialStepId,
      stepIndex,
      stepOutputs,
      {},
      resolvedOptions,
      resolvedContext,
      timer,
      stateManager,
      [],
      resumeSkipSteps.size > 0 ? resumeSkipSteps : undefined,
    );

    if (workflow.outputSchema) {
      // Find the terminating end step for error reporting
      let endStepId = "unknown";
      for (const step of workflow.steps) {
        if (step.type === "end" && step.id in stepOutputs) {
          endStepId = step.id;
        }
      }
      validateWorkflowOutput(
        workflow.outputSchema as Record<string, unknown>,
        chainOutput,
        endStepId,
      );
    }

    stateManager.runCompleted(chainOutput);
    return {
      success: true,
      stepOutputs,
      output: chainOutput,
      executionState: stateManager.currentState,
    };
  } catch (e) {
    const error =
      e instanceof StepExecutionError
        ? e
        : new ExternalServiceError(
            "unknown",
            "TOOL_EXECUTION_FAILED",
            e instanceof Error ? e.message : String(e),
            e,
            undefined,
            false,
          );
    stateManager.runFailed(error);
    return {
      success: false,
      stepOutputs,
      error,
      executionState: stateManager.currentState,
    };
  } finally {
    options.channel?.close();
  }
}

// ─── Streaming Helper ────────────────────────────────────────────

/**
 * Convenience wrapper that runs {@link executeWorkflow} and returns an
 * `AsyncIterable<ExecutionState>` that yields every state snapshot.
 *
 * The workflow executes in the background (fire-and-forget). The returned
 * iterable replays all states from the beginning and follows live updates
 * until the run completes or fails.
 */
export function executeWorkflowStream(
  workflow: WorkflowDefinition,
  options: ExecuteWorkflowOptions,
): AsyncIterable<ExecutionState> {
  const channel = new MemoryExecutionStateChannel();

  // Fire-and-forget — channel.close() is called by executeWorkflow's finally block.
  executeWorkflow(workflow, { ...options, channel });

  return channel.subscribe({ replay: true });
}

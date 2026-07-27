import type { WorkflowDefinition, WorkflowStep } from "../schema";
import type {
    AgentConfig,
    RemoraflowOptions,
    ResolvedRemoraflowOptions,
} from "../types";
import type {
    ExecutionContext,
    ExecutionEngine,
    StepPath,
} from "./execution-engine/types";
import type {
    UserInterventionAdapter,
    UserInterventionContext,
} from "./user-intervention/types";

export type ExecutionError = {
    code:
        | "INVALID_WORKFLOW"
        | "UNRECOGNIZED_CASE"
        | "MISSING_TOOL"
        | "MISSING_TOOL_EXECUTION_FUNCTION"
        | "TOOL_ERROR"
        | "AGENT_RUN_FAILED"
        | "LLM_RUN_FAILED"
        | "DATA_EXTRACTION_RUN_FAILED"
        | "WAIT_FOR_CONDITION_FAILED"
        | "ASK_SUPERVISOR_ERROR"
        | "DURATION_LIMIT_EXCEEDED"
        | "TYPE_ERROR"
        | "UNKNOWN";
    message: string;
    path?: PropertyKey[];
};

export type LogLine = {
    timestamp: Date;
    text: string;
};

/**
 * Host wiring plus the policy. Every limit lives in `policy` — there are no
 * limit fields alongside it, so a bound cannot be set in two places and
 * disagree with itself.
 */
export type ExecutionOptions = {
    /** Resolved once by the executor and shared with the validation pass. */
    policy?: RemoraflowOptions;
    executionEngine?: ExecutionEngine;
    userInterventionAdapter?: UserInterventionAdapter;
    silenceLogs?: boolean;
};

export type ResolvedExecutionOptions = Required<
    Omit<ExecutionOptions, "policy">
> & { policy: ResolvedRemoraflowOptions };

/**
 * Non-terminal statuses. The run is still live in every case — the waiting ones
 * exist so a host can tell a run that is deliberately blocked from one that has
 * hung, and report *what* it is blocked on.
 */
export type RunningExecutionStatus =
    | "in-progress"
    /** Serving a `sleep` step's delay. */
    | "sleeping"
    /** Polling a `wait-for-condition` step's condition. */
    | "awaiting-condition"
    /** Question sent; waiting for a supervisor to answer an `request-intervention` step. */
    | "awaiting-input";

export type ExecutionState =
    | {
          status: "error";
          output: null;
          error: ExecutionError;
          logs: LogLine[];
          scope: ExecutionScope;
      }
    | {
          status: RunningExecutionStatus;
          output: null | unknown;
          error: null;
          logs: LogLine[];
          scope: ExecutionScope;
      }
    | {
          status: "success";
          output: null | unknown;
          error: null;
          logs: LogLine[];
          scope: ExecutionScope;
      };

export type ExecutionScope = Record<string, unknown>;

export type StepExecutionUpdate =
    | {
          scope: ExecutionScope;
          output: unknown;
          error: null;
          /** Omitted when the step is not blocked on anything. */
          status?: RunningExecutionStatus;
      }
    | { scope: ExecutionScope | null; output: null; error: ExecutionError };

type StepOfType<T extends WorkflowStep["type"]> = Extract<
    WorkflowStep,
    { type: T }
>;

export type StepExecutorArgs<TStepType extends WorkflowStep["type"]> = {
    /**
     * Identifies this step's execution within the run — the enclosing blocks'
     * path plus the step id, so the same step in two loop iterations gets
     * distinct step keys. @see {@link StepPath}
     */
    uniqueStepIdPath: StepPath;
    step: StepOfType<TStepType>;
    scope: ExecutionScope;
    workflowDefinition: WorkflowDefinition;
    agentConfig: AgentConfig;
    executionContext: ExecutionContext;
    userInterventionContext: UserInterventionContext;
    options: ResolvedExecutionOptions;
};

export interface StepExecutor<
    TStepType extends WorkflowStep["type"] = WorkflowStep["type"],
> {
    stepType: TStepType;
    execute: (
        args: StepExecutorArgs<TStepType>,
    ) => AsyncGenerator<StepExecutionUpdate>;
}

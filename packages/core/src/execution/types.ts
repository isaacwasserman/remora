import type { WorkflowDefinition, WorkflowStep } from "../schema";
import type {
    LanguageModel,
    RemoraflowSettings,
    ResolvedRemoraflowSettings,
    ToolSet,
} from "../types";
import type { ApprovalPolicy } from "./approval-policies/types";
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
        | "LOOP_ITERATION_LIMIT_EXCEEDED"
        | "TYPE_ERROR"
        | "POLICY_DENIED"
        | "UNKNOWN";
    message: string;
    path?: PropertyKey[];
};

export type LogLine = {
    timestamp: Date;
    text: string;
};

export type ExecutionOptions = {
    settings?: RemoraflowSettings;
    approvalPolicies?: ApprovalPolicy[];
    executionEngine?: ExecutionEngine;
    userInterventionAdapter?: UserInterventionAdapter;
    silenceLogs?: boolean;
};

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
    step: StepOfType<TStepType>;
    scope: ExecutionScope;
    uniqueStepIdPath: StepPath;
    workflowDefinition: WorkflowDefinition;

    tools: ToolSet;
    model: LanguageModel;
    settings: ResolvedRemoraflowSettings;
    approvalPolicies: ApprovalPolicy[];

    executionContext: ExecutionContext;
    userInterventionContext: UserInterventionContext;
};

export interface StepExecutor<
    TStepType extends WorkflowStep["type"] = WorkflowStep["type"],
> {
    stepType: TStepType;
    execute: (
        args: StepExecutorArgs<TStepType>,
    ) => AsyncGenerator<StepExecutionUpdate>;
}

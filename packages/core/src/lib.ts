/** @module lib */
export type {
  CompilerLimits,
  CompilerResult,
  ConstrainedToolSchema,
  ConstrainedToolSchemaMap,
  Diagnostic,
  DiagnosticCode,
  DiagnosticLocation,
  DiagnosticSeverity,
  ExecutionGraph,
  ToolDefinitionMap,
  ToolSchemaDefinition,
} from "./compiler";
export { compileWorkflow, extractToolSchemas } from "./compiler";
export type {
  ExecuteWorkflowOptions,
  ExecutionResult,
  ExecutorLimits,
  WorkflowExecutionStateChannel,
  WorkflowExecutionStateChannelOptions,
} from "./executor";
export {
  BaseExecutionStateChannel,
  DEFAULT_APPROVAL_BACKOFF_MULTIPLIER,
  DEFAULT_APPROVAL_INTERVAL_MS,
  DEFAULT_APPROVAL_MAX_INTERVAL_MS,
  DEFAULT_APPROVAL_TIMEOUT_MS,
  executeWorkflow,
  executeWorkflowStream,
  MemoryExecutionStateChannel,
} from "./executor";
export type {
  DurableContext,
  WaitForConditionOptions,
} from "./executor/context";
export { createDefaultDurableContext } from "./executor/context";
export type {
  ErrorCategory,
  ErrorCode,
  RecoveryStrategy,
} from "./executor/errors";
export {
  AuthorizationError,
  ConfigurationError,
  ExpressionError,
  ExternalServiceError,
  OutputQualityError,
  StepExecutionError,
  ValidationError,
} from "./executor/errors";
export { hashWorkflow } from "./executor/hash";
export type {
  ApprovableAction,
  ApprovalRequestDecision,
  Policy,
  PolicyDecision,
  StaleCheckResult,
} from "./executor/policy";
export type {
  ErrorSnapshot,
  ExecutionDelta,
  ExecutionPathSegment,
  ExecutionState,
  RetryRecord,
  RunStatus,
  StepExecutionRecord,
  StepStatus,
  TraceEntry,
} from "./executor/state";
export { applyDelta, snapshotError } from "./executor/state";
export type {
  GenerateWorkflowFailure,
  GenerateWorkflowOptions,
  GenerateWorkflowResult,
  GenerateWorkflowSuccess,
  WorkflowFailureCode,
  WorkflowGeneratorToolOptions,
  WorkflowGiveUpCode,
} from "./generator";
export {
  createWorkflowGeneratorTool,
  generateWorkflow,
  WORKFLOW_GIVE_UP_CODES,
} from "./generator";
export {
  buildWorkflowGenerationPrompt,
  serializeToolsForPrompt,
} from "./generator/prompt";
export {
  type WorkflowDefinition,
  type WorkflowStep,
  workflowDefinitionSchema,
} from "./types";

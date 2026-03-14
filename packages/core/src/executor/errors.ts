// ─── Recovery & Classification Types ────────────────────────────

/** Strategy for recovering from a step execution error. */
export type RecoveryStrategy =
	| "none"
	| "retry"
	| "llm-transform"
	| "llm-reprompt";

/**
 * High-level category of a step execution error.
 * - `configuration` — the workflow is misconfigured (missing tools, no agent)
 * - `validation` — input or output data doesn't match the expected schema
 * - `external-service` — a tool or LLM call failed
 * - `expression` — a JMESPath or template expression failed to evaluate
 * - `output-quality` — the LLM produced output that couldn't be parsed
 */
export type ErrorCategory =
	| "configuration"
	| "validation"
	| "external-service"
	| "expression"
	| "output-quality";

/** Machine-readable error code identifying the specific failure. */
export type ErrorCode =
	// configuration — workflow is misconfigured
	| "TOOL_NOT_FOUND"
	| "TOOL_MISSING_EXECUTE"
	| "AGENT_NOT_PROVIDED"
	// validation — input/output data doesn't match expected schema/type
	| "TOOL_INPUT_VALIDATION_FAILED"
	| "FOREACH_TARGET_NOT_ARRAY"
	| "WORKFLOW_OUTPUT_VALIDATION_FAILED"
	// external-service — external service failure
	| "TOOL_EXECUTION_FAILED"
	| "LLM_API_ERROR"
	| "LLM_RATE_LIMITED"
	| "LLM_NETWORK_ERROR"
	| "LLM_NO_CONTENT"
	// expression — JMESPath or template evaluation failure
	| "JMESPATH_EVALUATION_ERROR"
	| "TEMPLATE_INTERPOLATION_ERROR"
	// output-quality — LLM produced unparseable/unusable output
	| "LLM_OUTPUT_PARSE_ERROR"
	// extraction — probe mode failures
	| "EXTRACTION_GAVE_UP"
	// wait — wait/sleep step errors
	| "SLEEP_INVALID_DURATION"
	| "WAIT_CONDITION_TIMEOUT"
	| "WAIT_CONDITION_MAX_ATTEMPTS"
	// execution limits — aggregate time bounds
	| "EXECUTION_TOTAL_TIMEOUT"
	| "EXECUTION_ACTIVE_TIMEOUT";

// ─── Base Error Class ───────────────────────────────────────────

/**
 * Base error class for all step execution failures. Contains the step ID,
 * error code, error category, and optional cause. All executor error classes
 * extend this.
 */
export class StepExecutionError extends Error {
	override readonly name = "StepExecutionError";

	constructor(
		public readonly stepId: string,
		public readonly code: ErrorCode,
		public readonly category: ErrorCategory,
		message: string,
		public override readonly cause?: unknown,
	) {
		super(message);
	}
}

// ─── Category Subclasses ────────────────────────────────────────

/** Thrown when the workflow is misconfigured (missing tools, missing agent, missing execute function). Not retryable. */
export class ConfigurationError extends StepExecutionError {
	constructor(stepId: string, code: ErrorCode, message: string) {
		super(stepId, code, "configuration", message);
	}
}

/** Thrown when input or output data doesn't match the expected schema. Not retryable. */
export class ValidationError extends StepExecutionError {
	constructor(
		stepId: string,
		code: ErrorCode,
		message: string,
		public readonly input: unknown,
		cause?: unknown,
	) {
		super(stepId, code, "validation", message, cause);
	}
}

/** Thrown when a tool execution or LLM API call fails. May be retryable (check {@link isRetryable}). */
export class ExternalServiceError extends StepExecutionError {
	constructor(
		stepId: string,
		code: ErrorCode,
		message: string,
		cause?: unknown,
		public readonly statusCode?: number,
		public readonly isRetryable: boolean = true,
	) {
		super(stepId, code, "external-service", message, cause);
	}
}

/** Thrown when a JMESPath expression or template interpolation fails to evaluate. Not retryable. */
export class ExpressionError extends StepExecutionError {
	constructor(
		stepId: string,
		code: ErrorCode,
		message: string,
		public readonly expression: string,
		cause?: unknown,
	) {
		super(stepId, code, "expression", message, cause);
	}
}

/** Thrown when an LLM produces output that can't be parsed as valid JSON. Retryable via automatic retry. */
export class OutputQualityError extends StepExecutionError {
	constructor(
		stepId: string,
		code: ErrorCode,
		message: string,
		public readonly rawOutput: unknown,
		cause?: unknown,
	) {
		super(stepId, code, "output-quality", message, cause);
	}
}

/** Thrown when the LLM determines that the requested data cannot be found or extracted from the source data during probe mode. Not retryable. */
export class ExtractionError extends StepExecutionError {
	constructor(
		stepId: string,
		message: string,
		public readonly reason: string,
	) {
		super(stepId, "EXTRACTION_GAVE_UP", "output-quality", message);
	}
}

// ─── Recovery & Classification Types ────────────────────────────

export type RecoveryStrategy =
	| "none"
	| "retry"
	| "llm-transform"
	| "llm-reprompt";

export type ErrorCategory =
	| "configuration"
	| "validation"
	| "external-service"
	| "expression"
	| "output-quality";

export type ErrorCode =
	// configuration — workflow is misconfigured
	| "TOOL_NOT_FOUND"
	| "TOOL_MISSING_EXECUTE"
	| "MODEL_NOT_PROVIDED"
	// validation — input data doesn't match expected schema/type
	| "TOOL_INPUT_VALIDATION_FAILED"
	| "FOREACH_TARGET_NOT_ARRAY"
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
	| "LLM_OUTPUT_PARSE_ERROR";

// ─── Base Error Class ───────────────────────────────────────────

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

export class ConfigurationError extends StepExecutionError {
	constructor(stepId: string, code: ErrorCode, message: string) {
		super(stepId, code, "configuration", message);
	}
}

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

export class ExternalServiceError extends StepExecutionError {
	constructor(
		stepId: string,
		code: ErrorCode,
		message: string,
		cause?: unknown,
		public readonly statusCode?: number,
		public readonly isRetryable: boolean = true,
	) {
		super(
			stepId,
			code,
			"external-service",
			message,
			cause,
		);
	}
}

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

export class OutputQualityError extends StepExecutionError {
	constructor(
		stepId: string,
		code: ErrorCode,
		message: string,
		public readonly rawOutput: unknown,
		cause?: unknown,
	) {
		super(
			stepId,
			code,
			"output-quality",
			message,
			cause,
		);
	}
}

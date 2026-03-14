import type { WorkflowDefinition, WorkflowStep } from "../types";

/** Severity level of a compiler diagnostic. */
export type DiagnosticSeverity = "error" | "warning";

/** Identifies the source location of a diagnostic within the workflow. */
export interface DiagnosticLocation {
	/** The step that triggered the diagnostic, or `null` for workflow-level issues. */
	stepId: string | null;
	/** The field path within the step (e.g. `"params.toolInput.email"`). */
	field: string;
}

/**
 * Machine-readable code identifying the specific diagnostic.
 * Useful for programmatic handling of compiler feedback.
 */
export type DiagnosticCode =
	| "INVALID_STEP_ID"
	| "INVALID_ITEM_NAME"
	| "ITEM_NAME_SHADOWS_STEP_ID"
	| "DUPLICATE_STEP_ID"
	| "MISSING_INITIAL_STEP"
	| "MISSING_NEXT_STEP"
	| "MISSING_BRANCH_BODY_STEP"
	| "MISSING_LOOP_BODY_STEP"
	| "UNREACHABLE_STEP"
	| "CYCLE_DETECTED"
	| "UNCLOSED_TEMPLATE_EXPRESSION"
	| "JMESPATH_SYNTAX_ERROR"
	| "JMESPATH_INVALID_ROOT_REFERENCE"
	| "JMESPATH_FORWARD_REFERENCE"
	| "END_STEP_HAS_NEXT"
	| "BRANCH_BODY_ESCAPES"
	| "LOOP_BODY_ESCAPES"
	| "MULTIPLE_DEFAULT_CASES"
	| "UNKNOWN_TOOL"
	| "MISSING_TOOL_INPUT_KEY"
	| "EXTRA_TOOL_INPUT_KEY"
	| "MISSING_START_STEP"
	| "END_STEP_MISSING_OUTPUT"
	| "END_STEP_UNEXPECTED_OUTPUT"
	| "PATH_MISSING_END_STEP"
	| "LITERAL_OUTPUT_SHAPE_MISMATCH"
	| "FOREACH_TARGET_NOT_ARRAY"
	| "MISSING_CONDITION_BODY_STEP"
	| "CONDITION_BODY_ESCAPES"
	| "SLEEP_DURATION_EXCEEDS_LIMIT"
	| "WAIT_ATTEMPTS_EXCEEDS_LIMIT"
	| "WAIT_INTERVAL_EXCEEDS_LIMIT"
	| "BACKOFF_MULTIPLIER_OUT_OF_RANGE"
	| "WAIT_TIMEOUT_EXCEEDS_LIMIT";

/**
 * A structured compiler diagnostic with a severity, location, human-readable message,
 * and machine-readable code. Emitted during compilation to report errors and warnings.
 */
export interface Diagnostic {
	severity: DiagnosticSeverity;
	location: DiagnosticLocation;
	/** A human-readable description of the issue. */
	message: string;
	code: DiagnosticCode;
}

/** JSON Schema representation of a tool's input and output. */
export interface ToolSchemaDefinition {
	inputSchema: {
		required?: string[];
		properties?: Record<string, unknown>;
	};
	outputSchema?: Record<string, unknown>;
}

/** Maps tool names to their schema definitions. */
export type ToolDefinitionMap = Record<string, ToolSchemaDefinition>;

/**
 * DAG representation of a compiled workflow. Produced by the compiler's graph
 * construction pass when the workflow is structurally valid.
 */
export interface ExecutionGraph {
	/** Lookup from step ID to step definition. */
	stepIndex: Map<string, WorkflowStep>;
	/** Maps each step ID to the set of step IDs it transitions to. */
	successors: Map<string, Set<string>>;
	/** Maps each step ID to the set of step IDs that transition to it. */
	predecessors: Map<string, Set<string>>;
	/** Step IDs in topological order (respects data dependencies). */
	topologicalOrder: string[];
	/** Set of step IDs reachable from `initialStepId`. */
	reachableSteps: Set<string>;
	/** Maps each step ID to the set of loop variable names in scope at that step. */
	loopVariablesInScope: Map<string, Set<string>>;
	/** Maps body step IDs to the ID of the for-each or switch-case that owns them. */
	bodyOwnership: Map<string, string>;
}

/**
 * A narrowed tool schema produced by the compiler showing which inputs are
 * static (known at compile time) vs. dynamic (resolved at runtime). This
 * enables safety reviews: a human can approve a limited set of behaviors
 * before execution begins.
 */
export interface ConstrainedToolSchema {
	/** The narrowed input schema, intersecting constraints from all call sites. */
	inputSchema: {
		required: string[];
		properties: Record<string, unknown>;
	};
	outputSchema?: Record<string, unknown>;
	/** True when ALL inputs across ALL call sites are literals — safe for unsupervised execution. */
	fullyStatic: boolean;
	/** Step IDs that call this tool. */
	callSites: string[];
}

/** Maps tool names to their constrained schemas. */
export type ConstrainedToolSchemaMap = Record<string, ConstrainedToolSchema>;

export interface CompilerLimits {
	/** Upper bound for wait-for-condition maxAttempts. Default: Infinity (unbounded). */
	maxAttempts?: number;
	/** Upper bound for sleep durationMs and wait intervalMs in ms. Default: 300_000 (5 min). */
	maxSleepMs?: number;
	/** Upper bound for backoffMultiplier. Default: 2. */
	maxBackoffMultiplier?: number;
	/** Lower bound for backoffMultiplier. Default: 1. */
	minBackoffMultiplier?: number;
	/** Upper bound for wait-for-condition timeoutMs in ms. Default: 600_000 (10 min). */
	maxTimeoutMs?: number;
}

/** The result of compiling a workflow definition. */
export interface CompilerResult {
	/** Errors and warnings produced during compilation. */
	diagnostics: Diagnostic[];
	/** The execution graph, or `null` if the workflow has structural errors. */
	graph: ExecutionGraph | null;
	/** The optimized workflow with best-practice transformations applied, or `null` if there are errors. */
	workflow: WorkflowDefinition | null;
	/** Constrained tool schemas, or `null` if no tools were provided. */
	constrainedToolSchemas: ConstrainedToolSchemaMap | null;
}

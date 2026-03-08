import type { WorkflowDefinition, WorkflowStep } from "../types";

export type DiagnosticSeverity = "error" | "warning";

export interface DiagnosticLocation {
	stepId: string | null;
	field: string;
}

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
	| "FOREACH_TARGET_NOT_ARRAY";

export interface Diagnostic {
	severity: DiagnosticSeverity;
	location: DiagnosticLocation;
	message: string;
	code: DiagnosticCode;
}

export interface ToolSchemaDefinition {
	inputSchema: {
		required?: string[];
		properties?: Record<string, unknown>;
	};
	outputSchema?: Record<string, unknown>;
}

export type ToolDefinitionMap = Record<string, ToolSchemaDefinition>;

export interface ExecutionGraph {
	stepIndex: Map<string, WorkflowStep>;
	successors: Map<string, Set<string>>;
	predecessors: Map<string, Set<string>>;
	topologicalOrder: string[];
	reachableSteps: Set<string>;
	loopVariablesInScope: Map<string, Set<string>>;
	bodyOwnership: Map<string, string>;
}

export interface ConstrainedToolSchema {
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

export type ConstrainedToolSchemaMap = Record<string, ConstrainedToolSchema>;

export interface CompilerResult {
	diagnostics: Diagnostic[];
	graph: ExecutionGraph | null;
	workflow: WorkflowDefinition | null;
	constrainedToolSchemas: ConstrainedToolSchemaMap | null;
}

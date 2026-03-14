import type { WorkflowDefinition, WorkflowStep } from "../../types";
import type { ExecutionGraph, ToolDefinitionMap } from "../types";

/**
 * Parse a simple dotted JMESPath expression (e.g. "step_id.field.nested")
 * into path segments. Returns null for complex expressions (filters,
 * projections, functions, etc.).
 */
export function parseSimplePath(expression: string): string[] | null {
	if (!/^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*$/.test(expression)) {
		return null;
	}
	return expression.split(".");
}

/**
 * Walk a JSON Schema along a dotted path, resolving through `properties`
 * at each segment. Returns null if the path can't be resolved.
 */
export function resolvePath(
	schema: Record<string, unknown>,
	path: string[],
): Record<string, unknown> | null {
	let current = schema;
	for (const segment of path) {
		const properties = current.properties as
			| Record<string, Record<string, unknown>>
			| undefined;
		if (!properties?.[segment]) return null;
		current = properties[segment];
	}
	return current;
}

/**
 * Extract the `type` string from a JSON Schema object.
 */
export function getSchemaType(schema: Record<string, unknown>): string | null {
	if (typeof schema.type === "string") return schema.type;
	return null;
}

/**
 * Find property names in a schema that are arrays.
 */
export function findArrayProperties(schema: Record<string, unknown>): string[] {
	const properties = schema.properties as
		| Record<string, Record<string, unknown>>
		| undefined;
	if (!properties) return [];
	return Object.entries(properties)
		.filter(([_, propSchema]) => propSchema.type === "array")
		.map(([name]) => name);
}

/**
 * Resolve the output schema of a workflow step. Returns null if the
 * output schema is unknown or can't be determined statically.
 */
export function getStepOutputSchema(
	step: WorkflowStep,
	tools: ToolDefinitionMap | null,
	workflow: WorkflowDefinition,
	graph: ExecutionGraph,
): Record<string, unknown> | null {
	switch (step.type) {
		case "tool-call": {
			if (!tools) return null;
			const toolDef = tools[step.params.toolName];
			return toolDef?.outputSchema ?? null;
		}
		case "llm-prompt":
		case "extract-data":
		case "agent-loop":
			return (step.params.outputFormat as Record<string, unknown>) ?? null;
		case "for-each": {
			// for-each produces an array whose items have the shape of the loop body's last output
			const bodyItemSchema = resolveChainOutputSchema(
				step.params.loopBodyStepId,
				tools,
				workflow,
				graph,
			);
			if (!bodyItemSchema) return null;
			return { type: "array", items: bodyItemSchema };
		}
		case "switch-case":
			// Can't statically determine which branch runs; return null
			// (individual branches are checked separately via output points)
			return null;
		case "start":
			return null;
		case "end":
			return null;
		default:
			return null;
	}
}

/**
 * Resolve the output schema that a chain produces by walking it to its
 * terminal step and returning that step's output schema.
 */
function resolveChainOutputSchema(
	startId: string,
	tools: ToolDefinitionMap | null,
	workflow: WorkflowDefinition,
	graph: ExecutionGraph,
): Record<string, unknown> | null {
	let currentId: string | undefined = startId;
	const visited = new Set<string>();

	while (currentId) {
		if (visited.has(currentId)) break;
		visited.add(currentId);

		const step = graph.stepIndex.get(currentId);
		if (!step) break;

		if (!step.nextStepId) {
			return getStepOutputSchema(step, tools, workflow, graph);
		}

		currentId = step.nextStepId;
	}

	return null;
}

/**
 * Resolve a JMESPath output expression to a JSON Schema by tracing
 * through step output schemas. Only handles simple dotted paths.
 * Returns null for complex expressions or when schemas are unavailable.
 */
export function resolveExpressionSchema(
	expression: string,
	_endStepId: string,
	tools: ToolDefinitionMap | null,
	workflow: WorkflowDefinition,
	graph: ExecutionGraph,
): Record<string, unknown> | null {
	const segments = parseSimplePath(expression);
	if (!segments) return null;

	const [rootId, ...fieldPath] = segments;
	if (!rootId) return null;

	let rootSchema: Record<string, unknown> | null = null;
	if (rootId === "input" && workflow.inputSchema) {
		rootSchema = workflow.inputSchema as Record<string, unknown>;
	} else {
		const referencedStep = graph.stepIndex.get(rootId);
		if (!referencedStep) return null;
		rootSchema = getStepOutputSchema(referencedStep, tools, workflow, graph);
	}

	if (!rootSchema) return null;

	if (fieldPath.length === 0) return rootSchema;
	return resolvePath(rootSchema, fieldPath);
}

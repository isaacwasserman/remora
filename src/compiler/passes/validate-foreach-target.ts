import type { WorkflowStep } from "../../types";
import type { Diagnostic, ExecutionGraph, ToolDefinitionMap } from "../types";

export function validateForeachTarget(
	workflow: { steps: WorkflowStep[] },
	graph: ExecutionGraph,
	tools: ToolDefinitionMap,
): Diagnostic[] {
	const diagnostics: Diagnostic[] = [];

	for (const step of workflow.steps) {
		if (step.type !== "for-each") continue;
		if (step.params.target.type !== "jmespath") continue;

		const expression = step.params.target.expression;

		// Only handle simple dotted paths (e.g. "step_id" or "step_id.field")
		const segments = parseSimplePath(expression);
		if (!segments) continue;

		const [rootId, ...fieldPath] = segments;
		if (!rootId) continue;

		const referencedStep = graph.stepIndex.get(rootId);
		if (!referencedStep) continue; // Handled by jmespath validation

		const outputSchema = getStepOutputSchema(referencedStep, tools);
		if (!outputSchema) continue;

		const resolvedSchema = resolvePath(outputSchema, fieldPath);
		if (!resolvedSchema) continue;

		const resolvedType = getSchemaType(resolvedSchema);
		if (resolvedType === "array") continue;

		if (resolvedType === "object") {
			const suggestions = findArrayProperties(resolvedSchema);
			const hint =
				suggestions.length > 0
					? ` Did you mean ${suggestions.map((s) => `'${rootId}.${s}'`).join(" or ")}?`
					: "";

			diagnostics.push({
				severity: "error",
				location: { stepId: step.id, field: "params.target" },
				message: `for-each target '${expression}' resolves to an object, not an array.${hint}`,
				code: "FOREACH_TARGET_NOT_ARRAY",
			});
		} else if (resolvedType !== null) {
			diagnostics.push({
				severity: "error",
				location: { stepId: step.id, field: "params.target" },
				message: `for-each target '${expression}' resolves to type '${resolvedType}', not an array.`,
				code: "FOREACH_TARGET_NOT_ARRAY",
			});
		}
	}

	return diagnostics;
}

function parseSimplePath(expression: string): string[] | null {
	if (!/^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*$/.test(expression)) {
		return null;
	}
	return expression.split(".");
}

function getStepOutputSchema(
	step: WorkflowStep,
	tools: ToolDefinitionMap,
): Record<string, unknown> | null {
	if (step.type === "tool-call") {
		const toolDef = tools[step.params.toolName];
		return toolDef?.outputSchema ?? null;
	}
	if (step.type === "start" && step.params.inputSchema) {
		return step.params.inputSchema as Record<string, unknown>;
	}
	return null;
}

function resolvePath(
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

function getSchemaType(schema: Record<string, unknown>): string | null {
	if (typeof schema.type === "string") return schema.type;
	return null;
}

function findArrayProperties(schema: Record<string, unknown>): string[] {
	const properties = schema.properties as
		| Record<string, Record<string, unknown>>
		| undefined;
	if (!properties) return [];
	return Object.entries(properties)
		.filter(([_, propSchema]) => propSchema.type === "array")
		.map(([name]) => name);
}

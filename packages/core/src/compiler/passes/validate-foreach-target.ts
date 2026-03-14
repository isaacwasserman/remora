import type { WorkflowDefinition } from "../../types";
import type { Diagnostic, ExecutionGraph, ToolDefinitionMap } from "../types";
import {
	findArrayProperties,
	getSchemaType,
	getStepOutputSchema,
	parseSimplePath,
	resolvePath,
} from "../utils/schema";

export function validateForeachTarget(
	workflow: WorkflowDefinition,
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

		let outputSchema: Record<string, unknown> | null = null;
		if (rootId === "input" && workflow.inputSchema) {
			outputSchema = workflow.inputSchema as Record<string, unknown>;
		} else {
			const referencedStep = graph.stepIndex.get(rootId);
			if (!referencedStep) continue; // Handled by jmespath validation
			outputSchema = getStepOutputSchema(
				referencedStep,
				tools,
				workflow,
				graph,
			);
		}
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

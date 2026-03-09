import type { WorkflowDefinition } from "../../types";
import type { Diagnostic, ExecutionGraph, ToolDefinitionMap } from "../types";
import { resolveExpressionSchema } from "../utils/schema";

export function validateControlFlow(
	workflow: WorkflowDefinition,
	graph: ExecutionGraph,
	tools?: ToolDefinitionMap | null,
): Diagnostic[] {
	const diagnostics: Diagnostic[] = [];

	for (const step of workflow.steps) {
		// End steps should not have nextStepId
		if (step.type === "end" && step.nextStepId) {
			diagnostics.push({
				severity: "error",
				location: { stepId: step.id, field: "nextStepId" },
				message: `End step '${step.id}' should not have a nextStepId`,
				code: "END_STEP_HAS_NEXT",
			});
		}

		// Switch-case: at most one default case
		if (step.type === "switch-case") {
			const defaultCount = step.params.cases.filter(
				(c) => c.value.type === "default",
			).length;
			if (defaultCount > 1) {
				diagnostics.push({
					severity: "error",
					location: { stepId: step.id, field: "params.cases" },
					message: `Switch-case step '${step.id}' has ${defaultCount} default cases (expected at most 1)`,
					code: "MULTIPLE_DEFAULT_CASES",
				});
			}

			// Validate branch bodies don't escape
			for (const [i, c] of step.params.cases.entries()) {
				const escapes = checkBodyEscapes(c.branchBodyStepId, step.id, graph);
				if (escapes) {
					diagnostics.push({
						severity: "warning",
						location: {
							stepId: step.id,
							field: `params.cases[${i}].branchBodyStepId`,
						},
						message: `Branch body starting at '${c.branchBodyStepId}' in step '${step.id}' has a step ('${escapes.escapingStep}') whose nextStepId points outside the branch body to '${escapes.target}'`,
						code: "BRANCH_BODY_ESCAPES",
					});
				}
			}
		}

		// For-each: validate loop body doesn't escape
		if (step.type === "for-each") {
			const escapes = checkBodyEscapes(
				step.params.loopBodyStepId,
				step.id,
				graph,
			);
			if (escapes) {
				diagnostics.push({
					severity: "warning",
					location: {
						stepId: step.id,
						field: "params.loopBodyStepId",
					},
					message: `Loop body starting at '${step.params.loopBodyStepId}' in step '${step.id}' has a step ('${escapes.escapingStep}') whose nextStepId points outside the loop body to '${escapes.target}'`,
					code: "LOOP_BODY_ESCAPES",
				});
			}
		}
	}

	// Output consistency checks
	if (workflow.outputSchema) {
		// Check that all execution paths reach an end step with a valid output expression
		const outputPoints = findWorkflowOutputPoints(
			workflow.initialStepId,
			graph,
		);
		for (const point of outputPoints) {
			if (point.type === "missing_end") {
				diagnostics.push({
					severity: "error",
					location: { stepId: point.stepId, field: "nextStepId" },
					message: `Step '${point.stepId}' is a terminal step but is not an end step; all execution paths must terminate at an end step when outputSchema is declared`,
					code: "PATH_MISSING_END_STEP",
				});
			} else if (point.type === "end_without_output") {
				diagnostics.push({
					severity: "error",
					location: { stepId: point.stepId, field: "params" },
					message: `End step '${point.stepId}' has no output expression, but the workflow declares an outputSchema`,
					code: "END_STEP_MISSING_OUTPUT",
				});
			} else if (point.type === "end_with_output") {
				// Validate output shapes against outputSchema at compile time
				const step = graph.stepIndex.get(point.stepId);
				if (step?.type === "end" && step.params?.output) {
					const expr = step.params.output;
					const outputSchema = workflow.outputSchema as Record<string, unknown>;
					if (expr.type === "literal") {
						diagnostics.push(
							...validateOutputShapeMismatch(
								expr.value,
								outputSchema,
								point.stepId,
							),
						);
					} else if (expr.type === "jmespath") {
						const resolvedSchema = resolveExpressionSchema(
							expr.expression,
							point.stepId,
							tools ?? null,
							workflow,
							graph,
						);
						if (resolvedSchema) {
							diagnostics.push(
								...validateSchemaCompatibility(
									resolvedSchema,
									outputSchema,
									point.stepId,
									expr.expression,
								),
							);
						}
					}
				}
			}
		}
	} else {
		for (const step of workflow.steps) {
			if (step.type === "end" && step.params?.output) {
				diagnostics.push({
					severity: "warning",
					location: { stepId: step.id, field: "params.output" },
					message: `End step '${step.id}' has an output expression, but the workflow does not declare an outputSchema`,
					code: "END_STEP_UNEXPECTED_OUTPUT",
				});
			}
		}
	}

	return diagnostics;
}

/**
 * Check if a body chain (loop body or branch body) has a step whose
 * nextStepId points outside the body. Follow the chain from startId
 * through nextStepId links; all steps in this chain should be owned
 * by parentStepId.
 */
function checkBodyEscapes(
	startId: string,
	parentStepId: string,
	graph: ExecutionGraph,
): { escapingStep: string; target: string } | null {
	let currentId: string | undefined = startId;
	const visited = new Set<string>();

	while (currentId) {
		if (visited.has(currentId)) break;
		visited.add(currentId);

		const step = graph.stepIndex.get(currentId);
		if (!step) break;

		if (step.nextStepId) {
			// Check if the next step is still owned by the same parent
			const nextOwner = graph.bodyOwnership.get(step.nextStepId);
			const currentOwner = graph.bodyOwnership.get(currentId);

			// The next step is escaping if:
			// 1. The current step is in the body (owned by parentStepId)
			// 2. The next step is NOT in the body (not owned by parentStepId)
			if (
				(currentOwner === parentStepId || currentId === startId) &&
				nextOwner !== parentStepId
			) {
				return { escapingStep: currentId, target: step.nextStepId };
			}
		}

		currentId = step.nextStepId;
	}

	return null;
}

type OutputPoint =
	| { type: "end_with_output"; stepId: string }
	| { type: "end_without_output"; stepId: string }
	| { type: "missing_end"; stepId: string };

/**
 * Find all workflow output points — the terminal positions where execution
 * stops and produces the workflow's final output. This walks the main chain
 * and recurses into branch/loop bodies when they are terminal (the parent
 * step has no nextStepId).
 */
function findWorkflowOutputPoints(
	startId: string,
	graph: ExecutionGraph,
): OutputPoint[] {
	return collectOutputPoints(startId, graph, new Set());
}

function collectOutputPoints(
	startId: string,
	graph: ExecutionGraph,
	visited: Set<string>,
): OutputPoint[] {
	const points: OutputPoint[] = [];
	let currentId: string | undefined = startId;

	while (currentId) {
		if (visited.has(currentId)) break;
		visited.add(currentId);

		const step = graph.stepIndex.get(currentId);
		if (!step) break;

		if (!step.nextStepId) {
			// This is a terminal step on this chain
			if (step.type === "end") {
				points.push({
					type: step.params?.output ? "end_with_output" : "end_without_output",
					stepId: step.id,
				});
			} else if (step.type === "switch-case") {
				// Terminal switch-case: each branch is an output point
				for (const c of step.params.cases) {
					points.push(
						...collectOutputPoints(c.branchBodyStepId, graph, visited),
					);
				}
			} else if (step.type === "for-each") {
				// Terminal for-each: loop body determines output shape
				points.push(
					...collectOutputPoints(step.params.loopBodyStepId, graph, visited),
				);
			} else {
				// Non-end, non-branching terminal step — path doesn't reach an end step
				points.push({ type: "missing_end", stepId: step.id });
			}
			break;
		}

		currentId = step.nextStepId;
	}

	return points;
}

/**
 * Validate a literal output value against the outputSchema at compile time.
 */
function validateOutputShapeMismatch(
	value: unknown,
	schema: Record<string, unknown>,
	stepId: string,
): Diagnostic[] {
	const diagnostics: Diagnostic[] = [];
	const expectedType = schema.type;

	if (typeof expectedType !== "string") return diagnostics;

	const actualType = getValueType(value);
	if (expectedType !== actualType) {
		diagnostics.push({
			severity: "error",
			location: { stepId, field: "params.output" },
			message: `End step '${stepId}' output literal has type '${actualType}' but outputSchema expects '${expectedType}'`,
			code: "LITERAL_OUTPUT_SHAPE_MISMATCH",
		});
		return diagnostics;
	}

	// For objects, validate required fields and property types
	if (
		expectedType === "object" &&
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value)
	) {
		const obj = value as Record<string, unknown>;
		const required = schema.required;
		if (Array.isArray(required)) {
			const missing = required.filter(
				(key: unknown) => typeof key === "string" && !((key as string) in obj),
			);
			if (missing.length > 0) {
				diagnostics.push({
					severity: "error",
					location: { stepId, field: "params.output" },
					message: `End step '${stepId}' output literal is missing required field(s): ${missing.join(", ")}`,
					code: "LITERAL_OUTPUT_SHAPE_MISMATCH",
				});
			}
		}

		const properties = schema.properties;
		if (properties && typeof properties === "object") {
			for (const [key, val] of Object.entries(obj)) {
				const propSchema = (properties as Record<string, unknown>)[key];
				if (
					propSchema &&
					typeof propSchema === "object" &&
					"type" in propSchema
				) {
					const propExpected = (propSchema as { type: string }).type;
					const propActual = getValueType(val);
					if (propExpected !== propActual) {
						diagnostics.push({
							severity: "error",
							location: { stepId, field: "params.output" },
							message: `End step '${stepId}' output literal field '${key}' has type '${propActual}' but schema expects '${propExpected}'`,
							code: "LITERAL_OUTPUT_SHAPE_MISMATCH",
						});
					}
				}
			}
		}
	}

	return diagnostics;
}

function getValueType(value: unknown): string {
	if (value === null) return "null";
	if (Array.isArray(value)) return "array";
	return typeof value;
}

/**
 * Validate that a resolved JMESPath expression schema is compatible with
 * the declared outputSchema. Checks root type and, for objects, required
 * fields and property types.
 */
function validateSchemaCompatibility(
	resolvedSchema: Record<string, unknown>,
	outputSchema: Record<string, unknown>,
	stepId: string,
	expression: string,
): Diagnostic[] {
	const diagnostics: Diagnostic[] = [];
	const expectedType = outputSchema.type;
	const resolvedType = resolvedSchema.type;

	if (typeof expectedType !== "string" || typeof resolvedType !== "string") {
		return diagnostics;
	}

	// Root type check
	if (expectedType !== resolvedType) {
		diagnostics.push({
			severity: "error",
			location: { stepId, field: "params.output" },
			message: `End step '${stepId}' output expression '${expression}' resolves to type '${resolvedType}' but outputSchema expects '${expectedType}'`,
			code: "LITERAL_OUTPUT_SHAPE_MISMATCH",
		});
		return diagnostics;
	}

	// For objects, check required fields and property types
	if (expectedType === "object") {
		const expectedRequired = outputSchema.required;
		const resolvedProps = (resolvedSchema.properties ?? {}) as Record<
			string,
			Record<string, unknown>
		>;

		if (Array.isArray(expectedRequired)) {
			const missing = expectedRequired.filter(
				(key: unknown) =>
					typeof key === "string" && !((key as string) in resolvedProps),
			);
			if (missing.length > 0) {
				diagnostics.push({
					severity: "error",
					location: { stepId, field: "params.output" },
					message: `End step '${stepId}' output expression '${expression}' schema is missing required field(s): ${missing.join(", ")}`,
					code: "LITERAL_OUTPUT_SHAPE_MISMATCH",
				});
			}
		}

		const expectedProps = (outputSchema.properties ?? {}) as Record<
			string,
			Record<string, unknown>
		>;
		for (const [key, expectedPropSchema] of Object.entries(expectedProps)) {
			const resolvedPropSchema = resolvedProps[key];
			if (!resolvedPropSchema) continue;
			const expectedPropType = expectedPropSchema.type;
			const resolvedPropType = resolvedPropSchema.type;
			if (
				typeof expectedPropType === "string" &&
				typeof resolvedPropType === "string" &&
				expectedPropType !== resolvedPropType
			) {
				diagnostics.push({
					severity: "error",
					location: { stepId, field: "params.output" },
					message: `End step '${stepId}' output expression '${expression}' field '${key}' has type '${resolvedPropType}' but outputSchema expects '${expectedPropType}'`,
					code: "LITERAL_OUTPUT_SHAPE_MISMATCH",
				});
			}
		}
	}

	return diagnostics;
}

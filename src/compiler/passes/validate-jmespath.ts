import type { WorkflowDefinition } from "../../types";
import type { Diagnostic, ExecutionGraph } from "../types";
import {
	extractRootIdentifiers,
	extractTemplateExpressions,
	validateJmespathSyntax,
} from "../utils/jmespath-helpers";

interface ExpressionInfo {
	expression: string;
	stepId: string;
	field: string;
}

export function validateJmespath(
	workflow: WorkflowDefinition,
	graph: ExecutionGraph,
): Diagnostic[] {
	const diagnostics: Diagnostic[] = [];

	// Collect all JMESPath expressions with location info
	const { expressions, templateDiagnostics } = collectExpressions(workflow);
	diagnostics.push(...templateDiagnostics);

	for (const expr of expressions) {
		// Syntax validation
		const syntaxResult = validateJmespathSyntax(expr.expression);
		if (!syntaxResult.valid) {
			diagnostics.push({
				severity: "error",
				location: { stepId: expr.stepId, field: expr.field },
				message: `Invalid JMESPath syntax in '${expr.expression}': ${syntaxResult.error}`,
				code: "JMESPATH_SYNTAX_ERROR",
			});
			continue; // Can't do scope validation on invalid syntax
		}

		// Scope/reference validation
		validateExpressionScope(expr, graph, diagnostics);
	}

	return diagnostics;
}

function collectExpressions(workflow: WorkflowDefinition): {
	expressions: ExpressionInfo[];
	templateDiagnostics: Diagnostic[];
} {
	const expressions: ExpressionInfo[] = [];
	const templateDiagnostics: Diagnostic[] = [];

	for (const step of workflow.steps) {
		switch (step.type) {
			case "tool-call":
				for (const [key, val] of Object.entries(step.params.toolInput)) {
					if (val.type === "jmespath") {
						expressions.push({
							expression: val.expression,
							stepId: step.id,
							field: `params.toolInput.${key}.expression`,
						});
					}
				}
				break;

			case "switch-case":
				if (step.params.switchOn.type === "jmespath") {
					expressions.push({
						expression: step.params.switchOn.expression,
						stepId: step.id,
						field: "params.switchOn.expression",
					});
				}
				for (const [i, c] of step.params.cases.entries()) {
					if (c.value.type === "jmespath") {
						expressions.push({
							expression: c.value.expression,
							stepId: step.id,
							field: `params.cases[${i}].value.expression`,
						});
					}
				}
				break;

			case "for-each":
				if (step.params.target.type === "jmespath") {
					expressions.push({
						expression: step.params.target.expression,
						stepId: step.id,
						field: "params.target.expression",
					});
				}
				break;

			case "extract-data":
				if (step.params.sourceData.type === "jmespath") {
					expressions.push({
						expression: step.params.sourceData.expression,
						stepId: step.id,
						field: "params.sourceData.expression",
					});
				}
				break;

			case "start":
				break;

			case "end":
				if (step.params?.output && step.params.output.type === "jmespath") {
					expressions.push({
						expression: step.params.output.expression,
						stepId: step.id,
						field: "params.output.expression",
					});
				}
				break;

			case "llm-prompt": {
				const { expressions: templateExprs, unclosed } =
					extractTemplateExpressions(step.params.prompt);
				for (const te of templateExprs) {
					expressions.push({
						expression: te.expression,
						stepId: step.id,
						field: `params.prompt[${te.start}:${te.end}]`,
					});
				}
				for (const pos of unclosed) {
					templateDiagnostics.push({
						severity: "error",
						location: {
							stepId: step.id,
							field: `params.prompt[${pos}]`,
						},
						message: `Unclosed template expression at position ${pos} in prompt`,
						code: "UNCLOSED_TEMPLATE_EXPRESSION",
					});
				}
				break;
			}
		}
	}

	return { expressions, templateDiagnostics };
}

function validateExpressionScope(
	expr: ExpressionInfo,
	graph: ExecutionGraph,
	diagnostics: Diagnostic[],
): void {
	const astRoots = extractRootIdentifiers(expr.expression);
	const loopVars = graph.loopVariablesInScope.get(expr.stepId);
	const predecessors = graph.predecessors.get(expr.stepId);

	for (const root of astRoots) {
		// Skip if it's a loop variable in scope
		if (loopVars?.has(root)) continue;

		// Check if it's a step ID
		if (graph.stepIndex.has(root)) {
			// Check if the step is a predecessor (has executed before this step)
			if (predecessors && !predecessors.has(root)) {
				diagnostics.push({
					severity: "warning",
					location: { stepId: expr.stepId, field: expr.field },
					message: `Expression '${expr.expression}' references step '${root}' which may not have executed before step '${expr.stepId}'`,
					code: "JMESPATH_FORWARD_REFERENCE",
				});
			}
			continue;
		}

		diagnostics.push({
			severity: "error",
			location: { stepId: expr.stepId, field: expr.field },
			message: `Expression '${expr.expression}' references '${root}' which is not a known step ID or loop variable in scope`,
			code: "JMESPATH_INVALID_ROOT_REFERENCE",
		});
	}
}

import type { WorkflowDefinition } from "../../types";
import type { Diagnostic, ExecutionGraph } from "../types";
import {
  extractRootIdentifiers,
  extractTemplateExpressions,
  validateJmespathSyntax,
} from "../utils/jmespath-helpers";

export interface ExpressionInfo {
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
    validateExpressionScope(expr, graph, !!workflow.inputSchema, diagnostics);
  }

  return diagnostics;
}

function collectFromExpressionValue(
  val: { type: string; expression?: string; template?: string },
  stepId: string,
  field: string,
  expressions: ExpressionInfo[],
  templateDiagnostics: Diagnostic[],
): void {
  if (val.type === "jmespath" && val.expression) {
    expressions.push({
      expression: val.expression,
      stepId,
      field: `${field}.expression`,
    });
  } else if (val.type === "template" && val.template) {
    const { expressions: templateExprs, unclosed } = extractTemplateExpressions(
      val.template,
    );
    for (const te of templateExprs) {
      expressions.push({
        expression: te.expression,
        stepId,
        field: `${field}.template[${te.start}:${te.end}]`,
      });
    }
    for (const pos of unclosed) {
      templateDiagnostics.push({
        severity: "error",
        location: { stepId, field: `${field}.template[${pos}]` },
        message: `Unclosed template expression at position ${pos} in template`,
        code: "UNCLOSED_TEMPLATE_EXPRESSION",
      });
    }
  }
}

export function collectExpressions(workflow: WorkflowDefinition): {
  expressions: ExpressionInfo[];
  templateDiagnostics: Diagnostic[];
} {
  const expressions: ExpressionInfo[] = [];
  const templateDiagnostics: Diagnostic[] = [];

  for (const step of workflow.steps) {
    switch (step.type) {
      case "tool-call":
        for (const [key, val] of Object.entries(step.params.toolInput)) {
          collectFromExpressionValue(
            val,
            step.id,
            `params.toolInput.${key}`,
            expressions,
            templateDiagnostics,
          );
        }
        break;

      case "switch-case":
        collectFromExpressionValue(
          step.params.switchOn,
          step.id,
          "params.switchOn",
          expressions,
          templateDiagnostics,
        );
        for (const [i, c] of step.params.cases.entries()) {
          collectFromExpressionValue(
            c.value,
            step.id,
            `params.cases[${i}].value`,
            expressions,
            templateDiagnostics,
          );
        }
        break;

      case "for-each":
        collectFromExpressionValue(
          step.params.target,
          step.id,
          "params.target",
          expressions,
          templateDiagnostics,
        );
        break;

      case "extract-data":
        collectFromExpressionValue(
          step.params.sourceData,
          step.id,
          "params.sourceData",
          expressions,
          templateDiagnostics,
        );
        break;

      case "start":
        break;

      case "end":
        if (step.params?.output) {
          collectFromExpressionValue(
            step.params.output,
            step.id,
            "params.output",
            expressions,
            templateDiagnostics,
          );
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

      case "agent-loop": {
        const { expressions: templateExprs, unclosed } =
          extractTemplateExpressions(step.params.instructions);
        for (const te of templateExprs) {
          expressions.push({
            expression: te.expression,
            stepId: step.id,
            field: `params.instructions[${te.start}:${te.end}]`,
          });
        }
        for (const pos of unclosed) {
          templateDiagnostics.push({
            severity: "error",
            location: {
              stepId: step.id,
              field: `params.instructions[${pos}]`,
            },
            message: `Unclosed template expression at position ${pos} in instructions`,
            code: "UNCLOSED_TEMPLATE_EXPRESSION",
          });
        }
        if (step.params.maxSteps) {
          collectFromExpressionValue(
            step.params.maxSteps,
            step.id,
            "params.maxSteps",
            expressions,
            templateDiagnostics,
          );
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
  hasInputSchema: boolean,
  diagnostics: Diagnostic[],
): void {
  const astRoots = extractRootIdentifiers(expr.expression);
  const loopVars = graph.loopVariablesInScope.get(expr.stepId);
  const predecessors = graph.predecessors.get(expr.stepId);

  for (const root of astRoots) {
    // Skip if it's the workflow input alias
    if (root === "input" && hasInputSchema) continue;

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

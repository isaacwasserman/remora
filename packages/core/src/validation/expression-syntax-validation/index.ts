import type { Expression } from "../../schema";
import {
    compileExpression,
    type ExpressionNode,
    JMESPATH_FUNCTION_NAMES,
} from "../../schemistry/jmespath/types";
import { extractTemplateInserts } from "../../schemistry/template";
import { expressionReferences } from "../../step-registry";
import type { ValidationModule, ValidatorDiagnostic } from "../types";

const knownFunctionNames = new Set<string>(JMESPATH_FUNCTION_NAMES);

function describeParseError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.split("\n")[0] ?? message;
}

function unknownFunctionNames(node: ExpressionNode): string[] {
    const own =
        node.type === "Function" && !knownFunctionNames.has(node.name)
            ? [node.name]
            : [];
    // Slice nodes hold numbers and nulls as children.
    const children = (node.children ?? []).filter(
        (child): child is ExpressionNode =>
            typeof child === "object" && child !== null,
    );
    return [...own, ...children.flatMap(unknownFunctionNames)];
}

function validateJmespath(
    source: string,
    path: PropertyKey[],
    context: string,
    diagnostics: ValidatorDiagnostic[],
) {
    try {
        for (const name of unknownFunctionNames(compileExpression(source))) {
            diagnostics.push({
                severity: "error",
                path,
                message: `Unknown JMESPath function "${name}()"${context}. The available functions are: ${JMESPATH_FUNCTION_NAMES.join(", ")}.`,
            });
        }
    } catch (error) {
        diagnostics.push({
            severity: "error",
            path,
            message: `Invalid JMESPath expression${context}: ${describeParseError(error)}`,
        });
    }
}

function validateExpression(
    expression: Expression,
    path: PropertyKey[],
    diagnostics: ValidatorDiagnostic[],
) {
    switch (expression.type) {
        case "jmespath": {
            validateJmespath(
                expression.expression,
                [...path, "expression"],
                "",
                diagnostics,
            );
            break;
        }
        case "template": {
            const templatePath = [...path, "template"];
            try {
                for (const insert of extractTemplateInserts(
                    expression.template,
                )) {
                    validateJmespath(
                        insert.expression,
                        templatePath,
                        " in template",
                        diagnostics,
                    );
                }
            } catch (error) {
                diagnostics.push({
                    severity: "error",
                    path: templatePath,
                    message: `Invalid template string: ${describeParseError(error)}`,
                });
            }
            break;
        }
        case "literal":
            break;
    }
}

export const expressionSyntaxValidator: ValidationModule = {
    id: "expression-syntax",
    failureMode: "block",
    validate: (workflowDefinition) => {
        const diagnostics: ValidatorDiagnostic[] = [];
        for (const [stepIndex, step] of workflowDefinition.steps.entries()) {
            if (!step) continue;
            for (const ref of expressionReferences(step)) {
                validateExpression(
                    ref.expression,
                    ["steps", stepIndex, ...ref.path],
                    diagnostics,
                );
            }
        }
        return { diagnostics };
    },
};

import type { Expression } from "../../schema";
import { compileExpression } from "../../schemistry/jmespath/types";
import { extractTemplateInserts } from "../../schemistry/template";
import { expressionReferences } from "../../step-registry";
import type { ValidationModule, ValidatorDiagnostic } from "../types";

function describeParseError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.split("\n")[0] ?? message;
}

function validateExpression(
    expression: Expression,
    path: ValidatorDiagnostic["path"],
    diagnostics: ValidatorDiagnostic[],
) {
    switch (expression.type) {
        case "jmespath": {
            try {
                compileExpression(expression.expression);
            } catch (error) {
                diagnostics.push({
                    severity: "error",
                    path: [...(path ?? []), "expression"],
                    message: `Invalid JMESPath expression: ${describeParseError(error)}`,
                });
            }
            break;
        }
        case "template": {
            try {
                for (const insert of extractTemplateInserts(
                    expression.template,
                )) {
                    try {
                        compileExpression(insert.expression);
                    } catch (error) {
                        diagnostics.push({
                            severity: "error",
                            path: [...(path ?? []), "template"],
                            message: `Invalid JMESPath expression in template: ${describeParseError(error)}`,
                        });
                    }
                }
            } catch (error) {
                diagnostics.push({
                    severity: "error",
                    path: [...(path ?? []), "template"],
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

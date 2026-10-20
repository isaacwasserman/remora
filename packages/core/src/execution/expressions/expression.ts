import type { Expression } from "../../schema";
import { extractTemplateInserts } from "../../schemistry";
import { search } from "../../schemistry/jmespath/runtime";
import type { ExecutionScope } from "../types";

export function evaluateExpressionAgainstScope(
    expression: Expression,
    scope: ExecutionScope,
    // biome-ignore lint/suspicious/noExplicitAny: Expression result types are determined by workflow schemas.
): any {
    switch (expression.type) {
        case "literal": {
            return expression.value;
        }
        case "jmespath": {
            return search(scope, expression.expression);
        }
        case "template": {
            const templateString = expression.template;
            const templateInserts = extractTemplateInserts(templateString);
            let formatted = "";
            let cursor = 0;
            for (const templateInsert of templateInserts) {
                formatted += templateString.slice(
                    cursor,
                    templateInsert.insertStart,
                );
                const evaluated = evaluateExpressionAgainstScope(
                    { type: "jmespath", expression: templateInsert.expression },
                    scope,
                );
                formatted +=
                    typeof evaluated === "object"
                        ? JSON.stringify(evaluated)
                        : String(evaluated);
                cursor = templateInsert.insertEnd;
            }
            formatted += templateString.slice(cursor);
            return formatted;
        }
    }
}

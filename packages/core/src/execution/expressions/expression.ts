import * as jmespath from "jmespath";
import type { Expression } from "../../schema";
import { extractTemplateInserts } from "../../schemistry";
import type { ExecutionScope } from "../types";

export function evaluateExpressionAgainstScope(
    expression: Expression,
    scope: ExecutionScope,
) {
    switch (expression.type) {
        case "literal": {
            return expression.value;
        }
        case "jmespath": {
            return jmespath.search(scope, expression.expression);
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

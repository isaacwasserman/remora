import type { Expression } from "@remoraflow/core";

export function formatExpression(expr: Expression): string {
    if (expr.type === "literal") return JSON.stringify(expr.value);
    if (expr.type === "template") return expr.template;
    return expr.expression;
}

export function formatValue(value: unknown): string {
    if (typeof value === "string") return value;
    return JSON.stringify(value);
}

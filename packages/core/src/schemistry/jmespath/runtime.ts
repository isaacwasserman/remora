import {
    compile,
    getRegisteredFunctions,
    type JSONValue,
    search as query,
} from "@jmespath-community/jmespath";

export type ExpressionNode = ReturnType<typeof compile>;
export type FunctionNode = Extract<ExpressionNode, { type: "Function" }>;

// Preserve the unquoted backtick strings accepted by jmespath 0.16.
const options = { enable_legacy_literals: true };

export const JMESPATH_FUNCTION_NAMES: readonly string[] = Object.freeze(
    getRegisteredFunctions().sort(),
);

export function compileExpression(expression: string): ExpressionNode {
    return compile(expression, options);
}

export function search(data: unknown, expression: string): JSONValue {
    return query(data as JSONValue, expression, options);
}

export function expressionChildren(node: ExpressionNode): ExpressionNode[] {
    switch (node.type) {
        case "AndExpression":
        case "Arithmetic":
        case "Comparator":
        case "IndexExpression":
        case "OrExpression":
        case "Pipe":
        case "Projection":
        case "Subexpression":
        case "ValueProjection":
            return [node.left, node.right];
        case "FilterProjection":
            return [node.left, node.right, node.condition];
        case "ExpressionReference":
        case "Flatten":
        case "NotExpression":
            return [node.child];
        case "Unary":
            return [node.operand];
        case "Function":
        case "MultiSelectList":
            return node.children;
        case "MultiSelectHash":
            return node.children.map((pair) => pair.value);
        case "LetExpression":
            return [...node.bindings, node.expression];
        case "Binding":
            return [node.reference];
        case "Ternary":
            return [node.condition, node.trueExpr, node.falseExpr];
        case "Current":
        case "Field":
        case "Identity":
        case "Index":
        case "Literal":
        case "Root":
        case "Slice":
        case "Variable":
            return [];
    }
}

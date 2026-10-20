import {
    compileExpression,
    type ExpressionNode,
    expressionChildren,
} from "./runtime";

/**
 * Returns the identifiers that a JMESPath query reads from its root input,
 * in order of first appearance. Fields read relative to a projected element
 * or a piped value are not root reads, so `a[*].b | c` yields only `a`.
 * Returns an empty array when the query does not compile.
 */
export function queryRootNames(query: string): string[] {
    let ast: ExpressionNode;
    try {
        ast = compileExpression(query);
    } catch {
        return [];
    }
    const names = new Set<string>();

    const visit = (node: ExpressionNode | undefined, atRoot: boolean) => {
        if (!node) return;
        switch (node.type) {
            case "Field":
                if (atRoot) names.add(node.name);
                return;
            case "Subexpression":
            case "IndexExpression":
            case "Pipe":
                visit(node.left, atRoot);
                visit(
                    node.right,
                    node.left.type === "Root" ||
                        (atRoot &&
                            (node.left.type === "Current" ||
                                node.left.type === "Identity")),
                );
                return;
            case "Projection":
            case "ValueProjection":
                visit(node.left, atRoot);
                visit(node.right, false);
                return;
            case "FilterProjection":
                visit(node.left, atRoot);
                visit(node.right, false);
                visit(node.condition, false);
                return;
            case "ExpressionReference":
                visit(node.child, false);
                return;
            default:
                for (const child of expressionChildren(node))
                    visit(child, atRoot);
        }
    };

    visit(ast, true);
    return [...names];
}

import { compileExpression, type ExpressionNode } from "./types";

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
            case "Projection":
            case "ValueProjection":
                visit(node.children[0], atRoot);
                visit(node.children[1], false);
                return;
            case "FilterProjection":
                visit(node.children[0], atRoot);
                visit(node.children[1], false);
                visit(node.children[2], false);
                return;
            case "MultiSelectHash":
                for (const pair of node.children) {
                    visit(pair.value as ExpressionNode, atRoot);
                }
                return;
            case "ExpressionReference":
                return;
            default:
                for (const child of node.children ?? []) visit(child, atRoot);
        }
    };

    visit(ast, true);
    return [...names];
}

import * as jmespath from "jmespath";

type ChildrenTuple = [
    ExpressionNode,
    ExpressionNode,
    ExpressionNode,
    ...ExpressionNode[],
];

export interface ExpressionNode {
    type: string;
    name: string;
    value: unknown;
    children: ChildrenTuple;
}

export interface FunctionNode extends ExpressionNode {
    type: "Function";
    name: string;
    children: ChildrenTuple;
}

export const compileExpression: (expression: string) => ExpressionNode =
    // @types/jmespath omits compile, but the runtime exports it
    // biome-ignore lint/suspicious/noExplicitAny: runtime API not in type defs
    (jmespath as any).compile;

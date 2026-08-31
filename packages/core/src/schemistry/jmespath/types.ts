import * as jmespath from "jmespath";

export interface ExpressionNode {
    type: string;
    name: string;
    value: unknown;
    children: ExpressionNode[];
}

export interface FunctionNode extends ExpressionNode {
    type: "Function";
    name: string;
    children: ExpressionNode[];
}

export const compileExpression: (expression: string) => ExpressionNode =
    // @types/jmespath omits compile, but the runtime exports it
    // biome-ignore lint/suspicious/noExplicitAny: runtime API not in type defs
    (jmespath as any).compile;

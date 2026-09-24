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

/** Must match the functions that the `jmespath` runtime defines. */
export const JMESPATH_FUNCTION_NAMES = [
    "abs",
    "avg",
    "ceil",
    "contains",
    "ends_with",
    "floor",
    "join",
    "keys",
    "length",
    "map",
    "max",
    "max_by",
    "merge",
    "min",
    "min_by",
    "not_null",
    "reverse",
    "sort",
    "sort_by",
    "starts_with",
    "sum",
    "to_array",
    "to_number",
    "to_string",
    "type",
    "values",
] as const;

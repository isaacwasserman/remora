import { describe, expect, test } from "bun:test";
import type { Expression } from "../../schema";
import type { ExecutionScope } from "../types";
import { evaluateExpressionAgainstScope } from "./expression";

const scope: ExecutionScope = {
    user: { name: "Ann", age: 30 },
    order: { id: 7, items: ["a", "b"] },
    flag: true,
};

describe("evaluateExpressionAgainstScope", () => {
    test("literal returns its value verbatim", () => {
        expect(
            evaluateExpressionAgainstScope(
                { type: "literal", value: 123 } as Expression,
                scope,
            ),
        ).toBe(123);
        const obj = { a: 1 };
        expect(
            evaluateExpressionAgainstScope(
                { type: "literal", value: obj } as Expression,
                scope,
            ),
        ).toBe(obj);
    });

    test("jmespath dispatches the query engine against scope", () => {
        expect(
            evaluateExpressionAgainstScope(
                { type: "jmespath", expression: "user.name" } as Expression,
                scope,
            ),
        ).toBe("Ann");
    });

    test("template interpolates inserts and preserves literal text", () => {
        expect(
            evaluateExpressionAgainstScope(
                {
                    type: "template",
                    template: "Hello ${user.name}, order ${order.id}!",
                } as Expression,
                scope,
            ),
        ).toBe("Hello Ann, order 7!");
    });

    test("template preserves text after a trailing insert", () => {
        expect(
            evaluateExpressionAgainstScope(
                {
                    type: "template",
                    template: "${order.id} items remain",
                } as Expression,
                scope,
            ),
        ).toBe("7 items remain");
    });

    test("template JSON-stringifies object values", () => {
        expect(
            evaluateExpressionAgainstScope(
                { type: "template", template: "u=${user}" } as Expression,
                scope,
            ),
        ).toBe('u={"name":"Ann","age":30}');
    });

    test("template supports a JMESPath multi-select hash", () => {
        expect(
            evaluateExpressionAgainstScope(
                {
                    type: "template",
                    template:
                        "result=${{name: user.name, itemCount: length(order.items)}}",
                } as Expression,
                scope,
            ),
        ).toBe('result={"name":"Ann","itemCount":2}');
    });

    test("template with no inserts returns the string unchanged", () => {
        expect(
            evaluateExpressionAgainstScope(
                { type: "template", template: "static" } as Expression,
                scope,
            ),
        ).toBe("static");
    });
});

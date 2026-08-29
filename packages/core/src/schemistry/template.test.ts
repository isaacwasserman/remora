import { describe, expect, test } from "bun:test";
import { extractTemplateInserts } from "./template";

describe("extractTemplateInserts", () => {
    test("returns nothing for a string with no inserts", () => {
        expect(extractTemplateInserts("plain text")).toEqual([]);
    });

    test("extracts a single insert with correct offsets", () => {
        const template = "Hello ${name}!";
        expect(extractTemplateInserts(template)).toEqual([
            {
                expression: "name",
                insertStart: 6,
                insertEnd: 13,
                expressionStart: 8,
                expressionEnd: 12,
            },
        ]);
    });

    test("extracts multiple inserts in order", () => {
        const inserts = extractTemplateInserts("${a} and ${b.c}");
        expect(inserts.map((i) => i.expression)).toEqual(["a", "b.c"]);
        expect(inserts[0]?.insertStart).toBe(0);
        expect(inserts[1]?.insertStart).toBe(9);
    });

    test("offsets slice back to the original insert and expression text", () => {
        const template = "x=${foo}";
        const [insert] = extractTemplateInserts(template);
        expect(template.slice(insert?.insertStart, insert?.insertEnd)).toBe(
            "${foo}",
        );
        expect(
            template.slice(insert?.expressionStart, insert?.expressionEnd),
        ).toBe("foo");
    });

    test("captures an empty expression", () => {
        expect(extractTemplateInserts("${}")).toEqual([
            {
                expression: "",
                insertStart: 0,
                insertEnd: 3,
                expressionStart: 2,
                expressionEnd: 2,
            },
        ]);
    });

    test("keeps JMESPath multi-select hashes within an insert", () => {
        const template =
            "Summary: ${{name: user.name, stats: {count: length(items)}}}";
        const [insert] = extractTemplateInserts(template);

        expect(insert?.expression).toBe(
            "{name: user.name, stats: {count: length(items)}}",
        );
        expect(template.slice(insert?.insertStart, insert?.insertEnd)).toBe(
            "${{name: user.name, stats: {count: length(items)}}}",
        );
    });

    test("does not close an insert at a brace inside a JMESPath string", () => {
        expect(extractTemplateInserts("${contains(message, '}')}")).toEqual([
            {
                expression: "contains(message, '}')",
                insertStart: 0,
                insertEnd: 25,
                expressionStart: 2,
                expressionEnd: 24,
            },
        ]);
    });
});

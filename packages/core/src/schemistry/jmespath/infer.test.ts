import { describe, expect, test } from "bun:test";
import type { JSONSchema7Definition } from "json-schema";
import { inferQueryOutputSchema } from "./infer";

const stringA: JSONSchema7Definition = {
    type: "object",
    properties: { a: { type: "string" } },
    required: ["a"],
};

const arrayOfB: JSONSchema7Definition = {
    type: "object",
    properties: {
        a: {
            type: "array",
            items: {
                type: "object",
                properties: { b: { type: "string" } },
            },
        },
    },
    required: ["a"],
};

describe("inferQueryOutputSchema", () => {
    describe("prompt examples", () => {
        test("querying a primitive is a bad access", () => {
            expect(inferQueryOutputSchema(stringA, "a.b").schema).toEqual({
                type: "null",
                badAccess: "true",
            });
        });

        test("projection onto a missing field is a bad access", () => {
            expect(inferQueryOutputSchema(arrayOfB, "a[*].c").schema).toEqual({
                type: "array",
                items: { type: "null", badAccess: "true" },
                badAccess: "false",
            });
        });

        test("projection onto an optional field is maybe", () => {
            expect(inferQueryOutputSchema(arrayOfB, "a[*].b").schema).toEqual({
                type: "array",
                items: { type: "string", badAccess: "maybe" },
                badAccess: "false",
            });
        });
    });

    describe("field access", () => {
        test("required field resolves cleanly", () => {
            expect(inferQueryOutputSchema(stringA, "a").schema).toEqual({
                type: "string",
                badAccess: "false",
            });
        });

        test("optional field is maybe", () => {
            const schema: JSONSchema7Definition = {
                type: "object",
                properties: { a: { type: "string" } },
            };
            expect(inferQueryOutputSchema(schema, "a").schema).toEqual({
                type: "string",
                badAccess: "maybe",
            });
        });

        test("missing field on a closed object is a bad access", () => {
            expect(inferQueryOutputSchema(stringA, "missing").schema).toEqual({
                type: "null",
                badAccess: "true",
            });
        });

        test("field on an open object is maybe/unknown", () => {
            const schema: JSONSchema7Definition = {
                type: "object",
                additionalProperties: { type: "number" },
            };
            expect(inferQueryOutputSchema(schema, "anything").schema).toEqual({
                type: "number",
                badAccess: "maybe",
            });
        });

        test("nested subexpression through a required object", () => {
            const schema: JSONSchema7Definition = {
                type: "object",
                properties: {
                    a: {
                        type: "object",
                        properties: { b: { type: "number" } },
                        required: ["b"],
                    },
                },
                required: ["a"],
            };
            expect(inferQueryOutputSchema(schema, "a.b").schema).toEqual({
                type: "number",
                badAccess: "false",
            });
        });
    });

    describe("index access", () => {
        const listSchema: JSONSchema7Definition = {
            type: "object",
            properties: { a: { type: "array", items: { type: "string" } } },
            required: ["a"],
        };
        const tupleSchema: JSONSchema7Definition = {
            type: "object",
            properties: {
                a: {
                    type: "array",
                    items: [{ type: "string" }, { type: "number" }],
                },
            },
            required: ["a"],
        };

        test("list index is maybe", () => {
            expect(inferQueryOutputSchema(listSchema, "a[0]").schema).toEqual({
                type: "string",
                badAccess: "maybe",
            });
        });

        test("tuple index in range resolves cleanly", () => {
            expect(inferQueryOutputSchema(tupleSchema, "a[1]").schema).toEqual({
                type: "number",
                badAccess: "false",
            });
        });

        test("tuple index out of range is a bad access", () => {
            expect(inferQueryOutputSchema(tupleSchema, "a[5]").schema).toEqual({
                type: "null",
                badAccess: "true",
            });
        });

        test("index into a primitive is a bad access", () => {
            expect(inferQueryOutputSchema(stringA, "a[0]").schema).toEqual({
                type: "null",
                badAccess: "true",
            });
        });
    });

    describe("unknown and union schemas", () => {
        test("access into an unknown schema is maybe", () => {
            expect(inferQueryOutputSchema(true, "a").schema).toEqual({
                type: "null",
                badAccess: "maybe",
            });
        });

        test("access into a union assumes each branch", () => {
            const schema: JSONSchema7Definition = {
                type: "object",
                properties: {
                    a: {
                        type: ["object", "null"],
                        properties: { b: { type: "string" } },
                        required: ["b"],
                    },
                },
                required: ["a"],
            };
            // The verdict lives on the union, not on its members: reading `b`
            // off a nullable `a` is possibly-invalid, not invalid.
            expect(inferQueryOutputSchema(schema, "a.b").schema).toEqual({
                anyOf: [
                    { type: "string", badAccess: "false" },
                    { type: "null", badAccess: "false" },
                ],
                badAccess: "maybe",
            });
        });
    });

    describe("projections and flatten", () => {
        const nestedArrays: JSONSchema7Definition = {
            type: "object",
            properties: {
                a: {
                    type: "array",
                    items: { type: "array", items: { type: "number" } },
                },
            },
            required: ["a"],
        };

        test("value projection over object values", () => {
            const schema: JSONSchema7Definition = {
                type: "object",
                properties: {
                    a: {
                        type: "object",
                        properties: {
                            x: { type: "string" },
                            y: { type: "string" },
                        },
                    },
                },
                required: ["a"],
            };
            expect(inferQueryOutputSchema(schema, "a.*").schema).toEqual({
                type: "array",
                items: { type: "string", badAccess: "false" },
                badAccess: "false",
            });
        });

        test("flatten collapses one level of nesting", () => {
            expect(inferQueryOutputSchema(nestedArrays, "a[]").schema).toEqual({
                type: "array",
                items: { type: "number", badAccess: "false" },
                badAccess: "false",
            });
        });

        test("pipe composes sequential access", () => {
            expect(inferQueryOutputSchema(arrayOfB, "a | [0]").schema).toEqual({
                type: "object",
                properties: { b: { type: "string" } },
                badAccess: "maybe",
            });
        });
    });

    describe("multi-select and identity", () => {
        test("multi-select list builds a tuple", () => {
            const schema: JSONSchema7Definition = {
                type: "object",
                properties: {
                    a: { type: "string" },
                    b: { type: "number" },
                },
                required: ["a", "b"],
            };
            expect(inferQueryOutputSchema(schema, "[a, b]").schema).toEqual({
                type: "array",
                items: [
                    { type: "string", badAccess: "false" },
                    { type: "number", badAccess: "false" },
                ],
                badAccess: "false",
            });
        });

        test("multi-select hash builds an object", () => {
            const schema: JSONSchema7Definition = {
                type: "object",
                properties: { a: { type: "string" } },
                required: ["a"],
            };
            expect(inferQueryOutputSchema(schema, "{x: a}").schema).toEqual({
                type: "object",
                properties: { x: { type: "string", badAccess: "false" } },
                required: ["x"],
                badAccess: "false",
            });
        });

        test("identity returns the input schema", () => {
            expect(inferQueryOutputSchema(stringA, "@").schema).toEqual({
                type: "object",
                properties: { a: { type: "string" } },
                required: ["a"],
                badAccess: "false",
            });
        });
    });

    describe("functions", () => {
        const listSchema: JSONSchema7Definition = {
            type: "object",
            properties: { a: { type: "array", items: { type: "number" } } },
            required: ["a"],
        };

        test("length returns a number", () => {
            expect(
                inferQueryOutputSchema(listSchema, "length(a)").schema,
            ).toEqual({
                type: "number",
                badAccess: "false",
            });
        });

        test("keys returns an array of strings", () => {
            expect(inferQueryOutputSchema(stringA, "keys(@)").schema).toEqual({
                type: "array",
                items: { type: "string" },
                badAccess: "false",
            });
        });

        test("sort preserves the array element type", () => {
            expect(
                inferQueryOutputSchema(listSchema, "sort(a)").schema,
            ).toEqual({
                type: "array",
                items: { type: "number" },
                badAccess: "false",
            });
        });

        test("to_string returns a string", () => {
            expect(
                inferQueryOutputSchema(listSchema, "to_string(a)").schema,
            ).toEqual({
                type: "string",
                badAccess: "false",
            });
        });

        test("map applies the expression to each element", () => {
            const schema: JSONSchema7Definition = {
                type: "object",
                properties: {
                    a: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: { b: { type: "string" } },
                            required: ["b"],
                        },
                    },
                },
                required: ["a"],
            };
            expect(inferQueryOutputSchema(schema, "map(&b, a)").schema).toEqual(
                {
                    type: "array",
                    items: { type: "string", badAccess: "false" },
                    badAccess: "false",
                },
            );
        });

        test("unknown function resolves to unknown", () => {
            expect(
                inferQueryOutputSchema(stringA, "mystery(a)").schema,
            ).toEqual({
                badAccess: "false",
            });
        });
    });

    describe("diagnostics", () => {
        test("clean access yields no diagnostics", () => {
            expect(inferQueryOutputSchema(stringA, "a").diagnostics).toEqual(
                [],
            );
        });

        test("invalid access is reported at the root", () => {
            const { diagnostics } = inferQueryOutputSchema(stringA, "a.b");
            expect(diagnostics).toEqual([
                {
                    badAccess: "true",
                    path: [],
                    message: "Invalid access: always resolves to null.",
                },
            ]);
        });

        test("bad access inside a projection is reported at its path", () => {
            const { diagnostics } = inferQueryOutputSchema(arrayOfB, "a[*].b");
            expect(diagnostics).toEqual([
                {
                    badAccess: "maybe",
                    path: ["items"],
                    message: "Possibly-invalid access: may resolve to null.",
                },
            ]);
        });

        test("union access is reported once, on the union itself", () => {
            // A nullable field is a normal shape, so accessing through it must
            // not also raise a hard error for the `null` alternative — that
            // would make every read of a switch-case branch output invalid.
            const schema: JSONSchema7Definition = {
                type: "object",
                properties: {
                    a: {
                        type: ["object", "null"],
                        properties: { b: { type: "string" } },
                        required: ["b"],
                    },
                },
                required: ["a"],
            };
            const { diagnostics } = inferQueryOutputSchema(schema, "a.b");
            expect(diagnostics).toEqual([
                {
                    badAccess: "maybe",
                    path: [],
                    message: "Possibly-invalid access: may resolve to null.",
                },
            ]);
        });

        test("union access is an error when no alternative resolves", () => {
            const schema: JSONSchema7Definition = {
                type: "object",
                properties: { a: { type: ["string", "number"] } },
                required: ["a"],
            };
            const { diagnostics } = inferQueryOutputSchema(schema, "a.b");
            expect(diagnostics).toEqual([
                {
                    badAccess: "true",
                    path: [],
                    message: "Invalid access: always resolves to null.",
                },
            ]);
        });
    });

    describe("function argument diagnostics", () => {
        const mixedSchema: JSONSchema7Definition = {
            type: "object",
            properties: {
                s: { type: "string" },
                n: { type: "number" },
                arr_n: { type: "array", items: { type: "number" } },
                arr_s: { type: "array", items: { type: "string" } },
                obj: {
                    type: "object",
                    properties: { x: { type: "string" } },
                },
            },
            required: ["s", "n", "arr_n", "arr_s", "obj"],
        };

        test("join with a tuple containing a number element is an error", () => {
            const { diagnostics } = inferQueryOutputSchema(
                mixedSchema,
                "join(',', [s, n])",
            );
            expect(diagnostics).toEqual([
                expect.objectContaining({
                    badAccess: "true",
                    message: expect.stringContaining("join"),
                }),
            ]);
        });

        test("join with correct types produces no diagnostic", () => {
            const { diagnostics } = inferQueryOutputSchema(
                mixedSchema,
                "join(',', arr_s)",
            );
            expect(diagnostics).toEqual([]);
        });

        test("abs of a string is an error", () => {
            const { diagnostics } = inferQueryOutputSchema(
                mixedSchema,
                "abs(s)",
            );
            expect(diagnostics).toEqual([
                expect.objectContaining({
                    badAccess: "true",
                    message: expect.stringContaining("abs"),
                }),
            ]);
        });

        test("avg of an array of strings is an error", () => {
            const { diagnostics } = inferQueryOutputSchema(
                mixedSchema,
                "avg(arr_s)",
            );
            expect(diagnostics).toEqual([
                expect.objectContaining({
                    badAccess: "true",
                    message: expect.stringContaining("avg"),
                }),
            ]);
        });

        test("keys of a string is an error", () => {
            const { diagnostics } = inferQueryOutputSchema(
                mixedSchema,
                "keys(s)",
            );
            expect(diagnostics).toEqual([
                expect.objectContaining({
                    badAccess: "true",
                    message: expect.stringContaining("keys"),
                }),
            ]);
        });

        test("length of a number is an error", () => {
            const { diagnostics } = inferQueryOutputSchema(
                mixedSchema,
                "length(n)",
            );
            expect(diagnostics).toEqual([
                expect.objectContaining({
                    badAccess: "true",
                    message: expect.stringContaining("length"),
                }),
            ]);
        });

        test("sort of an array of objects is an error", () => {
            const schema: JSONSchema7Definition = {
                type: "object",
                properties: {
                    arr: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: { x: { type: "string" } },
                        },
                    },
                },
                required: ["arr"],
            };
            const { diagnostics } = inferQueryOutputSchema(schema, "sort(arr)");
            expect(diagnostics).toEqual([
                expect.objectContaining({
                    badAccess: "true",
                    message: expect.stringContaining("sort"),
                }),
            ]);
        });

        test("nullable argument produces a warning", () => {
            const schema: JSONSchema7Definition = {
                type: "object",
                properties: {
                    n: { type: ["number", "null"] },
                },
                required: ["n"],
            };
            const { diagnostics } = inferQueryOutputSchema(schema, "abs(n)");
            expect(diagnostics).toEqual([
                expect.objectContaining({
                    badAccess: "maybe",
                    message: expect.stringContaining("abs"),
                }),
            ]);
        });

        test("unknown argument type produces no diagnostic", () => {
            const { diagnostics } = inferQueryOutputSchema(true, "abs(x)");
            const fnDiagnostics = diagnostics.filter((d) =>
                d.message.includes("abs()"),
            );
            expect(fnDiagnostics).toEqual([]);
        });

        test("output schema is unaffected by argument validation", () => {
            const { schema } = inferQueryOutputSchema(
                mixedSchema,
                "join(',', [s, n])",
            );
            expect(schema).toEqual({
                type: "string",
                badAccess: "false",
            });
        });

        test("starts_with with number arguments is an error", () => {
            const { diagnostics } = inferQueryOutputSchema(
                mixedSchema,
                "starts_with(n, s)",
            );
            expect(diagnostics).toEqual([
                expect.objectContaining({
                    badAccess: "true",
                    message: expect.stringContaining("starts_with"),
                }),
            ]);
        });

        test("contains with a number subject is an error", () => {
            const { diagnostics } = inferQueryOutputSchema(
                mixedSchema,
                "contains(n, s)",
            );
            expect(diagnostics).toEqual([
                expect.objectContaining({
                    badAccess: "true",
                    message: expect.stringContaining("contains"),
                }),
            ]);
        });
    });
});

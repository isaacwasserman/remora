import { describe, expect, test } from "bun:test";
import type { JSONSchema7Definition } from "json-schema";
import { schemaSubsetDiagnostics } from "./subset";

/** A closed object schema — how a resolved tool input is shaped. */
function closed(
    properties: Record<string, JSONSchema7Definition>,
    required: string[] = Object.keys(properties),
): JSONSchema7Definition {
    return {
        type: "object",
        properties,
        required,
        additionalProperties: false,
    };
}

function levelsByPath(sub: JSONSchema7Definition, sup: JSONSchema7Definition) {
    return schemaSubsetDiagnostics(sub, sup).map((d) => ({
        level: d.level,
        path: d.path,
    }));
}

describe("schemaSubsetDiagnostics", () => {
    test("an exact match yields no diagnostics", () => {
        const schema = closed({ name: { type: "string" } });
        expect(schemaSubsetDiagnostics(schema, schema)).toEqual([]);
    });

    test("a disjoint scalar type is a definite error", () => {
        expect(
            levelsByPath(
                closed({ age: { type: "string" } }),
                closed({ age: { type: "number" } }),
            ),
        ).toEqual([{ level: "error", path: ["age"] }]);
    });

    test("a missing required property is a definite error", () => {
        expect(
            levelsByPath(
                closed({ name: { type: "string" } }, ["name"]),
                closed({ name: { type: "string" }, age: { type: "number" } }, [
                    "name",
                    "age",
                ]),
            ),
        ).toEqual([{ level: "error", path: ["age"] }]);
    });

    test("an unexpected property is a definite error", () => {
        expect(
            levelsByPath(
                closed({ name: { type: "string" }, extra: { type: "string" } }),
                closed({ name: { type: "string" } }),
            ),
        ).toEqual([{ level: "error", path: ["extra"] }]);
    });

    test("a const outside the target enum is a definite error", () => {
        expect(
            levelsByPath(
                closed({ color: { type: "string", const: "purple" } }),
                closed({ color: { type: "string", enum: ["red", "blue"] } }),
            ),
        ).toEqual([{ level: "error", path: ["color"] }]);
    });

    test("a const outside the target numeric range is a definite error", () => {
        expect(
            levelsByPath(
                closed({ n: { type: "number", const: 3 } }),
                closed({ n: { type: "number", minimum: 5 } }),
            ),
        ).toEqual([{ level: "error", path: ["n"] }]);
    });

    test("a broader numeric type is a possible error (warning)", () => {
        expect(
            levelsByPath(
                closed({ n: { type: "number" } }),
                closed({ n: { type: "number", minimum: 5 } }),
            ),
        ).toEqual([{ level: "warning", path: ["n"] }]);
    });

    test("an unknown source type against a constrained target is a warning", () => {
        expect(
            levelsByPath(
                closed({ name: true }),
                closed({ name: { type: "string" } }),
            ),
        ).toEqual([{ level: "warning", path: ["name"] }]);
    });

    test("a bad-access sentinel (null + badAccess) is treated as unknown, not a definite error", () => {
        // What JMESPath type inference yields for a reference into unknown data;
        // the variable-reference validator owns the null-access error, so here it
        // should downgrade to a warning rather than a spurious type error.
        const sentinel = {
            type: "null",
            badAccess: "maybe",
        } as unknown as JSONSchema7Definition;
        expect(
            levelsByPath(
                closed({ n: sentinel }),
                closed({ n: { type: "number" } }),
            ),
        ).toEqual([{ level: "warning", path: ["n"] }]);
    });

    test("a narrower source (const within type) is accepted", () => {
        expect(
            schemaSubsetDiagnostics(
                closed({ name: { type: "string", const: "Ann" } }),
                closed({ name: { type: "string" } }),
            ),
        ).toEqual([]);
    });

    test("nested object mismatch is localized to its path", () => {
        expect(
            levelsByPath(
                closed({ user: closed({ id: { type: "string" } }) }),
                closed({ user: closed({ id: { type: "number" } }) }),
            ),
        ).toEqual([{ level: "error", path: ["user", "id"] }]);
    });

    test("array element mismatch is localized to items", () => {
        expect(
            levelsByPath(
                closed({ tags: { type: "array", items: { type: "number" } } }),
                closed({ tags: { type: "array", items: { type: "string" } } }),
            ),
        ).toEqual([{ level: "error", path: ["tags", "items"] }]);
    });

    test("internal $ref in the target is resolved", () => {
        const sup: JSONSchema7Definition = {
            type: "object",
            properties: { a: { $ref: "#/$defs/S" } },
            required: ["a"],
            additionalProperties: false,
            $defs: { S: { type: "string" } },
        };
        expect(
            schemaSubsetDiagnostics(closed({ a: { type: "string" } }), sup),
        ).toEqual([]);
        expect(levelsByPath(closed({ a: { type: "number" } }), sup)).toEqual([
            { level: "error", path: ["a"] },
        ]);
    });

    test("a `false` source schema (empty value set) is trivially a subset", () => {
        expect(
            schemaSubsetDiagnostics(
                closed({ n: false }),
                closed({ n: { type: "number" } }),
            ),
        ).toEqual([]);
    });

    test("a `false` target schema (accepts nothing) is a definite error", () => {
        expect(
            levelsByPath(
                closed({ n: { type: "number" } }),
                closed({ n: false }),
            ),
        ).toEqual([{ level: "error", path: ["n"] }]);
    });

    test("a property matching the target's patternProperties is permitted", () => {
        const sup: JSONSchema7Definition = {
            type: "object",
            patternProperties: { "^x_": { type: "string" } },
            additionalProperties: false,
        };
        expect(
            schemaSubsetDiagnostics(closed({ x_1: { type: "string" } }), sup),
        ).toEqual([]);
        expect(levelsByPath(closed({ x_1: { type: "number" } }), sup)).toEqual([
            { level: "error", path: ["x_1"] },
        ]);
    });

    test("an open tuple target permits extra source items", () => {
        expect(
            schemaSubsetDiagnostics(
                closed({
                    t: {
                        type: "array",
                        items: [{ type: "number" }, { type: "string" }],
                    },
                }),
                closed({ t: { type: "array", items: [{ type: "number" }] } }),
            ),
        ).toEqual([]);
    });

    test("a closed tuple target rejects extra source items", () => {
        expect(
            levelsByPath(
                closed({
                    t: {
                        type: "array",
                        items: [{ type: "number" }, { type: "string" }],
                    },
                }),
                closed({
                    t: {
                        type: "array",
                        items: [{ type: "number" }],
                        additionalItems: false,
                    },
                }),
            ),
        ).toEqual([{ level: "error", path: ["t"] }]);
    });

    test("an unguaranteed minItems is a possible error (warning)", () => {
        expect(
            levelsByPath(
                closed({ t: { type: "array", items: { type: "number" } } }),
                closed({
                    t: {
                        type: "array",
                        items: { type: "number" },
                        minItems: 2,
                    },
                }),
            ),
        ).toEqual([{ level: "warning", path: ["t"] }]);
    });

    test("a literal is validated exactly against exotic target keywords", () => {
        // Keywords arktype can only approximate (not / oneOf / if-then-else) are
        // checked precisely for a concrete literal value.
        const forbidsFive = JSON.parse(
            '{"type":"number","not":{"const":5}}',
        ) as JSONSchema7Definition;
        expect(
            levelsByPath(
                closed({ n: { type: "number", const: 5 } }),
                closed({ n: forbidsFive }),
            ),
        ).toEqual([{ level: "error", path: ["n"] }]);
        expect(
            schemaSubsetDiagnostics(
                closed({ n: { type: "number", const: 6 } }),
                closed({ n: forbidsFive }),
            ),
        ).toEqual([]);
    });

    test("a literal object is validated against a target if/then/else", () => {
        const conditional = JSON.parse(
            '{"type":"object","if":{"properties":{"a":{"const":1}}},"then":{"required":["b"]},"properties":{"a":{"type":"number"}}}',
        ) as JSONSchema7Definition;
        // a === 1 triggers the `then` branch, which requires `b`; the literal
        // { a: 1 } omits it, so this is a definite error.
        const sub = {
            type: "object",
            const: { a: 1 },
            additionalProperties: false,
        } as unknown as JSONSchema7Definition;
        expect(
            levelsByPath(
                closed({ payload: sub }),
                closed({ payload: conditional }),
            ),
        ).toEqual([{ level: "error", path: ["payload"] }]);
    });

    test("a target anyOf accepts a source matching one branch, rejects one matching none", () => {
        const anyOf: JSONSchema7Definition = {
            anyOf: [{ type: "string" }, { type: "number" }],
        };
        expect(
            schemaSubsetDiagnostics(
                closed({ v: { type: "string" } }),
                closed({ v: anyOf }),
            ),
        ).toEqual([]);
        expect(
            levelsByPath(
                closed({ v: { type: "boolean" } }),
                closed({ v: anyOf }),
            ),
        ).toEqual([{ level: "error", path: ["v"] }]);
    });

    test("a dynamic source against a target oneOf is conservative, a literal is exact", () => {
        const oneOf: JSONSchema7Definition = {
            oneOf: [{ type: "string" }, { type: "number" }],
        };
        // Dynamic type: oneOf becomes an opaque predicate → conservative warning.
        expect(
            levelsByPath(
                closed({ v: { type: "string" } }),
                closed({ v: oneOf }),
            ),
        ).toEqual([{ level: "warning", path: ["v"] }]);
        // Literal matching exactly one branch → precise, no diagnostic.
        expect(
            schemaSubsetDiagnostics(
                closed({ v: { type: "string", const: "a" } }),
                closed({ v: oneOf }),
            ),
        ).toEqual([]);
    });

    test("a source enum that is a subset passes; a partially-out-of-range enum warns", () => {
        expect(
            schemaSubsetDiagnostics(
                closed({ v: { type: "string", enum: ["a", "b"] } }),
                closed({ v: { type: "string", enum: ["a", "b", "c"] } }),
            ),
        ).toEqual([]);
        expect(
            levelsByPath(
                closed({ v: { type: "string", enum: ["a", "z"] } }),
                closed({ v: { type: "string", enum: ["a", "b"] } }),
            ),
        ).toEqual([{ level: "warning", path: ["v"] }]);
    });

    test("string constraints: unguaranteed for a dynamic type (warning), exact for a literal (error)", () => {
        expect(
            levelsByPath(
                closed({ v: { type: "string" } }),
                closed({ v: { type: "string", minLength: 3 } }),
            ),
        ).toEqual([{ level: "warning", path: ["v"] }]);
        expect(
            levelsByPath(
                closed({ v: { type: "string", const: "ab" } }),
                closed({ v: { type: "string", minLength: 3 } }),
            ),
        ).toEqual([{ level: "error", path: ["v"] }]);
        expect(
            levelsByPath(
                closed({ v: { type: "string", const: "xyz" } }),
                closed({ v: { type: "string", pattern: "^a" } }),
            ),
        ).toEqual([{ level: "error", path: ["v"] }]);
    });

    test("multipleOf: unguaranteed for a dynamic type (warning), exact for a literal (error)", () => {
        expect(
            levelsByPath(
                closed({ v: { type: "number" } }),
                closed({ v: { type: "number", multipleOf: 5 } }),
            ),
        ).toEqual([{ level: "warning", path: ["v"] }]);
        expect(
            levelsByPath(
                closed({ v: { type: "number", const: 7 } }),
                closed({ v: { type: "number", multipleOf: 5 } }),
            ),
        ).toEqual([{ level: "error", path: ["v"] }]);
    });

    test("independent problems on several properties are all reported", () => {
        expect(
            levelsByPath(
                closed({ a: { type: "string" }, b: { type: "number" } }),
                closed({ a: { type: "number" }, b: { type: "string" } }),
            ),
        ).toEqual([
            { level: "error", path: ["a"] },
            { level: "error", path: ["b"] },
        ]);
    });

    test("a mismatch inside an array of objects is localized through items", () => {
        expect(
            levelsByPath(
                closed({
                    rows: {
                        type: "array",
                        items: closed({ id: { type: "string" } }),
                    },
                }),
                closed({
                    rows: {
                        type: "array",
                        items: closed({ id: { type: "number" } }),
                    },
                }),
            ),
        ).toEqual([{ level: "error", path: ["rows", "items", "id"] }]);
    });

    test("a schema-valued additionalProperties governs extra properties", () => {
        const sup: JSONSchema7Definition = {
            type: "object",
            properties: {},
            additionalProperties: { type: "string" },
        };
        expect(
            schemaSubsetDiagnostics(
                closed({ x: { type: "string" } }, ["x"]),
                sup,
            ),
        ).toEqual([]);
        expect(
            levelsByPath(closed({ x: { type: "number" } }, ["x"]), sup),
        ).toEqual([{ level: "error", path: ["x"] }]);
    });

    test("a keyword the type backend cannot parse degrades to no diagnostics", () => {
        // `propertyNames` is valid JSON Schema that arktype rejects outright, so
        // the target reads as unknown and must not produce a false positive.
        const unparseable = JSON.parse(
            '{"propertyNames":{"pattern":"^x"}}',
        ) as JSONSchema7Definition;
        const sup = closed({ x: unparseable });
        expect(
            schemaSubsetDiagnostics(closed({ x: { type: "number" } }), sup),
        ).toEqual([]);
    });
});

import { describe, expect, test } from "bun:test";
import type { JSONSchema7 } from "json-schema";
import { requestedOutputSchemaDiagnostics } from "./output-schema";

const requestedSchema: JSONSchema7 = {
    type: "object",
    properties: {
        decision: { type: "string", enum: ["approved", "rejected"] },
    },
    required: ["decision"],
    additionalProperties: false,
};

describe("requestedOutputSchemaDiagnostics", () => {
    test("accepts an exact schema", () => {
        expect(
            requestedOutputSchemaDiagnostics(
                structuredClone(requestedSchema),
                requestedSchema,
            ),
        ).toEqual([]);
    });

    test("accepts a schema guaranteed to be narrower", () => {
        expect(
            requestedOutputSchemaDiagnostics(
                {
                    type: "object",
                    properties: {
                        decision: { const: "approved" },
                    },
                    required: ["decision"],
                    additionalProperties: false,
                },
                requestedSchema,
            ),
        ).toEqual([]);
    });

    test("rejects an omitted generated output schema without throwing", () => {
        expect(
            requestedOutputSchemaDiagnostics(undefined, requestedSchema),
        ).toEqual([
            {
                level: "error",
                path: ["outputSchema"],
                message:
                    "The generated workflow must declare an output schema.",
            },
        ]);
    });

    test("rejects a broader overlapping schema", () => {
        const diagnostics = requestedOutputSchemaDiagnostics(
            {
                type: "object",
                properties: { decision: { type: "string" } },
                required: ["decision"],
                additionalProperties: false,
            },
            requestedSchema,
        );

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]?.level).toBe("warning");
    });

    test("rejects a disjoint schema", () => {
        const diagnostics = requestedOutputSchemaDiagnostics(
            {
                type: "object",
                properties: { decision: { type: "number" } },
                required: ["decision"],
                additionalProperties: false,
            },
            requestedSchema,
        );

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]?.level).toBe("error");
    });
});

import type { JSONSchema7Definition } from "json-schema";

/** A JSON Schema (draft-7) definition — the type language schemistry infers in. */
export type JsonSchema = JSONSchema7Definition;

export function inferJsonSchema(value: unknown): JsonSchema {
    switch (typeof value) {
        case "object": {
            if (value === null) {
                return { type: "null" };
            } else if (Array.isArray(value)) {
                const itemTypes = value.map((item) => inferJsonSchema(item));
                const itemTypesHashable = itemTypes.map((itemType) =>
                    JSON.stringify(itemType),
                );
                const itemTypesAreUniform = itemTypesHashable.every(
                    (typeString) => typeString === itemTypesHashable[0],
                );
                if (itemTypesAreUniform) {
                    return {
                        type: "array",
                        items: itemTypes[0],
                    };
                } else {
                    return {
                        type: "array",
                        items: itemTypes,
                    };
                }
            } else {
                return {
                    type: "object",
                    properties: Object.fromEntries(
                        Object.entries(value).map(([k, v]) => [
                            k,
                            inferJsonSchema(v),
                        ]),
                    ),
                    required: Object.keys(value),
                };
            }
        }
        case "string": {
            return {
                type: "string",
                const: value,
            };
        }
        case "number": {
            return {
                type: "number",
                const: value,
            };
        }
        case "boolean": {
            return {
                type: "boolean",
                const: value,
            };
        }
        default: {
            return true;
        }
    }
}

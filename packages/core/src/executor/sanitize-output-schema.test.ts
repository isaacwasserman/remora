import { expect, test } from "bun:test";
import { sanitizeOutputSchema } from "./sanitize-output-schema";

test("strips minItems > 1 and maxItems from array schemas", () => {
  const schema = {
    type: "object" as const,
    properties: {
      friends: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            name: { type: "string" as const },
          },
          required: ["name"],
        },
        minItems: 5,
        maxItems: 5,
      },
    },
    required: ["friends"],
  };

  const sanitized = sanitizeOutputSchema(schema);

  expect(sanitized.properties.friends).not.toHaveProperty("minItems");
  expect(sanitized.properties.friends).not.toHaveProperty("maxItems");
  expect((sanitized.properties.friends as Record<string, unknown>).type).toBe(
    "array",
  );
  expect(
    (
      (sanitized.properties.friends as Record<string, unknown>).items as Record<
        string,
        unknown
      >
    ).type,
  ).toBe("object");
});

test("preserves minItems of 0 and 1", () => {
  const schema = {
    type: "object" as const,
    properties: {
      a: {
        type: "array" as const,
        items: { type: "string" as const },
        minItems: 0,
      },
      b: {
        type: "array" as const,
        items: { type: "string" as const },
        minItems: 1,
      },
    },
  };

  const sanitized = sanitizeOutputSchema(schema);

  expect((sanitized.properties.a as Record<string, unknown>).minItems).toBe(0);
  expect((sanitized.properties.b as Record<string, unknown>).minItems).toBe(1);
});

test("strips numerical constraints", () => {
  const schema = {
    type: "object" as const,
    properties: {
      age: {
        type: "integer" as const,
        minimum: 0,
        maximum: 150,
        multipleOf: 1,
      },
    },
  };

  const sanitized = sanitizeOutputSchema(schema);

  expect(sanitized.properties.age).not.toHaveProperty("minimum");
  expect(sanitized.properties.age).not.toHaveProperty("maximum");
  expect(sanitized.properties.age).not.toHaveProperty("multipleOf");
  expect((sanitized.properties.age as Record<string, unknown>).type).toBe(
    "integer",
  );
});

test("strips string constraints but preserves format", () => {
  const schema = {
    type: "object" as const,
    properties: {
      email: {
        type: "string" as const,
        format: "email",
        minLength: 1,
        maxLength: 255,
        pattern: ".*@.*",
      },
    },
  };

  const sanitized = sanitizeOutputSchema(schema);

  // format IS supported
  expect((sanitized.properties.email as Record<string, unknown>).format).toBe(
    "email",
  );
  // string constraints are NOT supported
  expect(sanitized.properties.email).not.toHaveProperty("minLength");
  expect(sanitized.properties.email).not.toHaveProperty("maxLength");
  expect(sanitized.properties.email).not.toHaveProperty("pattern");
});

test("preserves supported keywords: default, anyOf, allOf, $ref, $defs", () => {
  const schema = {
    type: "object" as const,
    $defs: {
      Name: { type: "string" as const },
    },
    properties: {
      name: { $ref: "#/$defs/Name", default: "unknown" },
      status: { anyOf: [{ const: "active" }, { const: "inactive" }] },
    },
  };

  const sanitized = sanitizeOutputSchema(schema);

  expect((sanitized as Record<string, unknown>).$defs).toBeDefined();
  expect((sanitized.properties.name as Record<string, unknown>).$ref).toBe(
    "#/$defs/Name",
  );
  expect((sanitized.properties.name as Record<string, unknown>).default).toBe(
    "unknown",
  );
  expect(
    (sanitized.properties.status as Record<string, unknown>).anyOf,
  ).toHaveLength(2);
});

test("preserves basic supported properties unchanged", () => {
  const schema = {
    type: "object" as const,
    properties: {
      name: { type: "string" as const, description: "The name" },
    },
    required: ["name"],
    additionalProperties: false,
  };

  const sanitized = sanitizeOutputSchema(schema);
  expect(sanitized).toEqual(schema);
});

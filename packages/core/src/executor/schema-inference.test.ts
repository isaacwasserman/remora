import { describe, expect, test } from "bun:test";
import { inferSchema, summarizeObjectStructure } from "./schema-inference";

describe("inferSchema", () => {
  test("primitive types", () => {
    expect(inferSchema("hello")).toEqual({ __literal: "hello" });
    expect(inferSchema(42)).toEqual({ __literal: 42 });
    expect(inferSchema(true)).toEqual({ __literal: true });
    expect(inferSchema(null)).toBe("null");
    expect(inferSchema(undefined)).toBe("undefined");
  });

  test("simple object", () => {
    expect(inferSchema({ a: 1, b: "hello" })).toEqual({
      a: { __literal: 1 },
      b: { __literal: "hello" },
    });
  });

  test("homogeneous array", () => {
    expect(inferSchema([1, 2, 3])).toEqual(["number", 3]);
  });

  test("heterogeneous array", () => {
    // With 3 different types, no single type reaches 50%
    expect(inferSchema([1, "hello", true])).toEqual([
      "number",
      "string",
      "boolean",
    ]);
  });

  test("nested objects", () => {
    expect(inferSchema({ user: { name: "Alice", age: 30 } })).toEqual({
      user: { name: { __literal: "Alice" }, age: { __literal: 30 } },
    });
  });

  test("array of objects with uniform schema", () => {
    const data = [
      { name: "Alice", age: 30 },
      { name: "Bob", age: 25 },
      { name: "Charlie", age: 35 },
    ];
    expect(inferSchema(data)).toEqual([{ name: "string", age: "number" }, 3]);
  });

  test("dictionary detection with many uniform keys", () => {
    const dict: Record<string, { name: string; score: number }> = {};
    for (let i = 0; i < 10; i++) {
      dict[`user_${i}`] = { name: `User ${i}`, score: i * 10 };
    }
    const schema = inferSchema(dict);
    // Representative schema preserves literals from the first matching value
    expect(schema).toHaveProperty("__dict");
    const dictSchema = (schema as { __dict: [unknown, number] }).__dict;
    expect(dictSchema[1]).toBe(10);
    // The representative value schema has literal values
    const valueSchema = dictSchema[0] as Record<string, unknown>;
    expect(valueSchema).toHaveProperty("name");
    expect(valueSchema).toHaveProperty("score");
  });

  test("empty array", () => {
    expect(inferSchema([])).toEqual([]);
  });

  test("empty object", () => {
    expect(inferSchema({})).toEqual({});
  });

  test("truncates keys beyond maxKeys", () => {
    const obj: Record<string, number> = {};
    for (let i = 0; i < 25; i++) {
      obj[`key_${String(i).padStart(2, "0")}`] = i;
    }
    const schema = inferSchema(obj, [], 5) as Record<string, unknown>;
    const keys = Object.keys(schema);
    expect(keys.length).toBe(6); // 5 keys + truncation marker
    expect(keys[5]).toBe("...20 more keys");
    expect(schema["...20 more keys"]).toBe("truncated");
  });

  test("long strings become 'string' type even outside arrays", () => {
    const longStr = "a".repeat(201);
    expect(inferSchema(longStr)).toBe("string");
  });

  test("scalars inside arrays use type names", () => {
    expect(inferSchema(["hello", "world"])).toEqual(["string", 2]);
    expect(inferSchema([true, false])).toEqual(["boolean", 2]);
  });

  test("null-aware merging for arrays with nullable fields", () => {
    // Need 3+ elements so that exact-match uniformity (<50%) falls through
    // to the null-aware path
    const data = [
      { name: "Alice", hostname: null, port: 80 },
      { name: null, hostname: "server1", port: 443 },
      { name: "Bob", hostname: "server2", port: null },
    ];
    const schema = inferSchema(data);
    // Should unify via null-aware merging, recovering non-null types
    expect(schema).toEqual([
      { name: "string", hostname: "string", port: "number" },
      3,
    ]);
  });

  test("heterogeneous array truncation with maxKeys", () => {
    // Create array with many distinct types that won't unify
    const data = Array.from({ length: 25 }, (_, i) => {
      const obj: Record<string, unknown> = {};
      obj[`unique_key_${i}`] = i;
      return obj;
    });
    const schema = inferSchema(data, [], 5);
    // Should truncate to maxKeys elements + "...N more" marker
    expect(Array.isArray(schema)).toBe(true);
    const arr = schema as unknown[];
    expect(arr.length).toBe(6); // 5 + "...20 more"
    expect(arr[5]).toBe("...20 more");
  });
});

describe("summarizeObjectStructure", () => {
  test("simple object without indent", () => {
    const result = summarizeObjectStructure({ a: 1, b: "hello" });
    expect(result).toBe('{ a: 1, b: "hello" }');
  });

  test("simple object with indent", () => {
    const result = summarizeObjectStructure({ a: 1, b: "hello" }, 2);
    expect(result).toContain("a: 1");
    expect(result).toContain('b: "hello"');
    expect(result).toContain("\n");
  });

  test("array notation", () => {
    const result = summarizeObjectStructure({ items: [1, 2, 3] } as object);
    expect(result).toBe("{ items: number[3] }");
  });

  test("dictionary notation", () => {
    const dict: Record<string, { name: string; value: number }> = {};
    for (let i = 0; i < 10; i++) {
      dict[`k${i}`] = { name: `n${i}`, value: i };
    }
    const result = summarizeObjectStructure(dict);
    expect(result).toContain("[key]");
    expect(result).toContain("[10]");
  });

  test("nested structure with indent", () => {
    const data = {
      users: [
        { name: "Alice", age: 30 },
        { name: "Bob", age: 25 },
      ],
      metadata: { total: 2 },
    };
    const result = summarizeObjectStructure(data, 2);
    expect(result).toContain("users:");
    expect(result).toContain("name: string");
    expect(result).toContain("metadata:");
    expect(result).toContain("total: 2");
  });
});

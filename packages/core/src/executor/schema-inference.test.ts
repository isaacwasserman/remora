import { describe, expect, test } from "bun:test";
import { inferSchema, summarizeObjectStructure } from "./schema-inference";

describe("inferSchema", () => {
	test("primitive types", () => {
		expect(inferSchema("hello")).toBe("string");
		expect(inferSchema(42)).toBe("number");
		expect(inferSchema(true)).toBe("boolean");
		expect(inferSchema(null)).toBe("null");
		expect(inferSchema(undefined)).toBe("undefined");
	});

	test("simple object", () => {
		expect(inferSchema({ a: 1, b: "hello" })).toEqual({
			a: "number",
			b: "string",
		});
	});

	test("homogeneous array", () => {
		expect(inferSchema([1, 2, 3])).toEqual(["number", 3]);
	});

	test("heterogeneous array", () => {
		// With 4 different types, no single type reaches 50%
		expect(inferSchema([1, "hello", true, null])).toEqual([
			"number",
			"string",
			"boolean",
			"null",
		]);
	});

	test("nested objects", () => {
		expect(inferSchema({ user: { name: "Alice", age: 30 } })).toEqual({
			user: { name: "string", age: "number" },
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
		expect(schema).toEqual({
			__dict: [{ name: "string", score: "number" }, 10],
		});
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
});

describe("summarizeObjectStructure", () => {
	test("simple object without indent", () => {
		const result = summarizeObjectStructure({ a: 1, b: "hello" });
		expect(result).toBe("{ a: number, b: string }");
	});

	test("simple object with indent", () => {
		const result = summarizeObjectStructure({ a: 1, b: "hello" }, 2);
		expect(result).toContain("a: number");
		expect(result).toContain("b: string");
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
		expect(result).toContain("total: number");
	});
});

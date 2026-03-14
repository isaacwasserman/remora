function deepEqual(a: unknown, b: unknown): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Strips array length annotations from a schema so that structural comparison
 * ignores differences like string[1] vs string[2]. Used for dictionary detection
 * where values have the same shape but varying array sizes.
 */
function normalizeSchemaShape(schema: unknown): unknown {
	if (schema === null || schema === undefined) return schema;
	if (typeof schema === "string") return schema;
	if (Array.isArray(schema)) {
		// Uniform array [elementSchema, length] → normalize element, drop length
		if (schema.length === 2 && typeof schema[1] === "number") {
			return [normalizeSchemaShape(schema[0]), 0];
		}
		return schema.map(normalizeSchemaShape);
	}
	if (typeof schema === "object") {
		const normalized: Record<string, unknown> = {};
		for (const [key, val] of Object.entries(schema)) {
			normalized[key] = normalizeSchemaShape(val);
		}
		return normalized;
	}
	return schema;
}

function mostCommon<T>(arr: T[]): T | null {
	if (arr.length === 0) return null;

	const counts = new Map<number, { element: T; count: number }>();

	arr.forEach((item) => {
		let found = false;
		for (const [_idx, entry] of counts.entries()) {
			if (deepEqual(item, entry.element)) {
				entry.count++;
				found = true;
				break;
			}
		}
		if (!found) {
			counts.set(counts.size, { element: item, count: 1 });
		}
	});

	let max = { element: arr[0] as T, count: 0 };
	for (const entry of counts.values()) {
		if (entry.count > max.count) max = entry;
	}

	return max.element;
}

export function inferSchema(
	value: unknown,
	types: unknown[] = [],
	maxKeys = 20,
) {
	let schema: unknown;
	if (value === null) {
		schema = "null";
	} else if (value === undefined) {
		schema = "undefined";
	} else if (typeof value === "object") {
		if (Array.isArray(value)) {
			const elementSchemas = value.map((element) =>
				inferSchema(element, types, maxKeys),
			);

			const mostCommonElementSchema = mostCommon(elementSchemas);

			const percentUniformSchemas =
				elementSchemas.filter((schema) =>
					deepEqual(schema, mostCommonElementSchema),
				).length / elementSchemas.length;

			const allElementsHaveSameSchema = percentUniformSchemas >= 0.5;

			if (allElementsHaveSameSchema) {
				schema = [mostCommonElementSchema, value.length];
			} else {
				schema = elementSchemas;
			}
		} else {
			const keys = Object.keys(value);
			const totalKeys = keys.length;

			// Check for dictionary pattern: many keys with identical complex value schemas
			// Sample up to maxKeys to avoid expensive inference on very large objects
			if (totalKeys >= 3) {
				const sampleKeys = keys.slice(0, maxKeys);
				const valueSchemas = sampleKeys.map((key) =>
					inferSchema((value as Record<string, unknown>)[key], [], maxKeys),
				);

				// Compare normalized schemas (ignoring array lengths)
				const normalizedSchemas = valueSchemas.map(normalizeSchemaShape);
				const mostCommonNormalized = mostCommon(normalizedSchemas);

				if (
					mostCommonNormalized !== null &&
					typeof mostCommonNormalized === "object" &&
					mostCommonNormalized !== null
				) {
					const uniformCount = normalizedSchemas.filter((s) =>
						deepEqual(s, mostCommonNormalized),
					).length;
					const percentUniform = uniformCount / sampleKeys.length;

					if (uniformCount >= 3 && percentUniform >= 0.75) {
						// Use the first matching (non-normalized) schema as representative
						const representativeSchema = valueSchemas.find((s) =>
							deepEqual(normalizeSchemaShape(s), mostCommonNormalized),
						);
						schema = {
							__dict: [representativeSchema, totalKeys],
						};
						types.push(schema);
						return schema;
					}
				}
			}

			const _schema: Record<string, unknown> = {};
			const keysToInclude = keys.slice(0, maxKeys);

			for (const key of keysToInclude) {
				_schema[key] = inferSchema(
					(value as Record<string, unknown>)[key],
					types,
					maxKeys,
				);
			}

			if (totalKeys > maxKeys) {
				_schema[`...${totalKeys - maxKeys} more keys`] = "truncated";
			}

			schema = _schema;
		}
	} else if (typeof value === "string") {
		schema = "string";
	} else if (typeof value === "number") {
		schema = "number";
	} else if (typeof value === "boolean") {
		schema = "boolean";
	} else {
		schema = "unknown";
	}

	types.push(schema);
	return schema;
}

function schemaToString(schema: unknown, indent?: string | number): string {
	const indentStr = typeof indent === "number" ? " ".repeat(indent) : indent;
	const pretty = indentStr !== undefined;

	function stringify(value: unknown, depth = 0): string {
		// Handle null and undefined
		if (value === null) return "null";
		if (value === undefined) return "undefined";

		// Handle primitive types (strings)
		if (typeof value === "string") return value;

		// Handle arrays - check if it's the special [schema, length] format
		if (Array.isArray(value)) {
			// Check if this is a uniform array representation: [schema, length]
			if (value.length === 2 && typeof value[1] === "number") {
				// Transform [schema, length] -> schema[length]
				return `${stringify(value[0], depth)}[${value[1]}]`;
			}

			// Otherwise it's a heterogeneous array, stringify each element
			if (!pretty || !indentStr) {
				return `[${value.map((v) => stringify(v, depth)).join(", ")}]`;
			}

			const currentIndent = indentStr.repeat(depth);
			const nextIndent = indentStr.repeat(depth + 1);
			const items = value
				.map((v) => `${nextIndent}${stringify(v, depth + 1)}`)
				.join(",\n");
			return `[\n${items}\n${currentIndent}]`;
		}

		// Handle objects
		if (typeof value === "object") {
			// Check for dictionary marker: { __dict: [valueSchema, count] }
			const entries = Object.entries(value);
			const first = entries[0];
			if (
				entries.length === 1 &&
				first !== undefined &&
				first[0] === "__dict" &&
				Array.isArray(first[1]) &&
				first[1].length === 2 &&
				typeof first[1][1] === "number"
			) {
				const [valueSchema, count] = first[1];
				if (!pretty || !indentStr) {
					return `{ [key]: ${stringify(valueSchema, depth)} }[${count}]`;
				}
				const currentIndent = indentStr.repeat(depth);
				const nextIndent = indentStr.repeat(depth + 1);
				return `{\n${nextIndent}[key]: ${stringify(valueSchema, depth + 1)}\n${currentIndent}}[${count}]`;
			}

			if (!pretty || !indentStr) {
				const formatted = entries
					.map(([key, val]) => `${key}: ${stringify(val, depth)}`)
					.join(", ");
				return `{ ${formatted} }`;
			}

			const currentIndent = indentStr.repeat(depth);
			const nextIndent = indentStr.repeat(depth + 1);
			const formatted = entries
				.map(
					([key, val]) => `${nextIndent}${key}: ${stringify(val, depth + 1)}`,
				)
				.join(",\n");
			return `{\n${formatted}\n${currentIndent}}`;
		}

		// Fallback to JSON.stringify for other types
		return JSON.stringify(value);
	}

	return stringify(schema);
}

export function summarizeObjectStructure(
	value: object,
	indent?: string | number,
) {
	const schema = inferSchema(value);
	return schemaToString(schema, indent);
}

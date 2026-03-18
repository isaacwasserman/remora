/**
 * Sanitize a JSON Schema for use with LLM structured output APIs.
 *
 * Many LLM providers (e.g. Anthropic) only support a subset of JSON Schema.
 * This function recursively strips or adjusts unsupported keywords so the
 * schema can be sent without triggering API errors.
 *
 * Based on Anthropic's compatibility matrix:
 *
 * Supported: basic types, enum (primitives only), const, anyOf, allOf
 * (with limitations), $ref/$defs/definitions (internal only), default,
 * required, additionalProperties (must be false), string formats
 * (date-time, time, date, duration, email, hostname, uri, ipv4, ipv6, uuid),
 * array minItems (only 0 or 1).
 *
 * Not supported: numerical constraints (minimum, maximum, multipleOf, etc.),
 * string constraints (minLength, maxLength), array constraints beyond
 * minItems 0/1 (maxItems, uniqueItems), pattern, recursive schemas,
 * additionalProperties set to non-false values.
 */
export function sanitizeOutputSchema<T extends Record<string, unknown>>(
  schema: T,
): T {
  return stripUnsupported(schema) as T;
}

/**
 * JSON Schema keywords that are unconditionally unsupported by LLM
 * structured output APIs and should be stripped.
 */
const UNSUPPORTED_KEYWORDS = new Set([
  // Numerical constraints
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  // String constraints
  "minLength",
  "maxLength",
  "pattern",
  "patternProperties",
  // Array constraints (minItems handled specially below)
  "maxItems",
  "uniqueItems",
  // Object constraints
  "minProperties",
  "maxProperties",
  // Conditional schemas
  "if",
  "then",
  "else",
  "not",
  // Meta keywords not used by LLM APIs
  "$id",
  "$schema",
  "$anchor",
  "$comment",
  "contentEncoding",
  "contentMediaType",
  "deprecated",
  "readOnly",
  "writeOnly",
  "examples",
]);

function stripUnsupported(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripUnsupported);
  }
  if (typeof value === "object" && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (UNSUPPORTED_KEYWORDS.has(k)) continue;

      // minItems: only 0 and 1 are supported; strip anything else
      if (k === "minItems" && typeof v === "number" && v > 1) continue;

      result[k] = stripUnsupported(v);
    }
    return result;
  }
  return value;
}

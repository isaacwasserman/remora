import { jsonSchemaToType } from "@ark/json-schema";
import Ajv from "ajv";
import type { JsonSchema } from "arktype";
import type { JSONSchema7, JSONSchema7Definition } from "json-schema";

const ajv = new Ajv({ allErrors: true });

/**
 * A reason why one schema (`sub`) is not a subset of another (`sup`).
 * - `error`: the two schemas are disjoint at this point — a conforming `sub`
 *   value can *never* satisfy `sup` ("this will definitely not validate").
 * - `warning`: `sub` is broader than `sup` but they overlap — *some* values
 *   valid under `sub` will not validate under `sup`.
 */
export type SubsetDiagnostic = {
    level: "error" | "warning";
    path: (string | number)[];
    message: string;
};

/** Minimal surface of an arktype `Type` that we rely on. */
interface ArkType {
    extends(r: unknown): boolean;
    overlaps(r: unknown): boolean;
    readonly expression?: string;
}

type Relationship = "subset" | "overlap" | "disjoint";

/**
 * Reports where the value set described by `sub` is not guaranteed to satisfy
 * `sup` (i.e. where `sub ⊄ sup`), localizing each diagnostic to a
 * property/index path.
 */
export function schemaSubsetDiagnostics(
    sub: JSONSchema7Definition,
    sup: JSONSchema7Definition,
): SubsetDiagnostic[] {
    const resolvedSub = deref(sub, sub, new Set());
    const resolvedSup = deref(sup, sup, new Set());
    return getDiagnostics(resolvedSub, resolvedSup, []);
}

function getDiagnostics(
    sub: JSONSchema7Definition,
    sup: JSONSchema7Definition,
    path: (string | number)[],
): SubsetDiagnostic[] {
    // `false` is the empty value set — trivially a subset of any target. A
    // `false` target accepts nothing, so any non-empty source fails against it.
    if (sub === false) {
        return [];
    }
    if (sup === false) {
        return [
            {
                level: "error",
                path,
                message:
                    "Definitely invalid: the target schema accepts no value.",
            },
        ];
    }
    // A literal value is validated exactly against the whole target — no
    // structural recursion, and never "overlap" (a single value matches or not).
    if (typeof sub === "object" && "const" in sub) {
        return constDiagnostics(sub.const, sup, path);
    }
    if (typeof sub === "object" && typeof sup === "object") {
        if (isObjectSchema(sub) && isObjectSchema(sup)) {
            return objectDiagnostics(sub, sup, path);
        }
        if (isArraySchema(sub) && isArraySchema(sup)) {
            return arrayDiagnostics(sub, sup, path);
        }
    }
    const relationship = classify(sub, sup);
    return relationship === "subset"
        ? []
        : [leaf(sub, sup, path, relationship)];
}

function objectDiagnostics(
    sub: JSONSchema7,
    sup: JSONSchema7,
    path: (string | number)[],
): SubsetDiagnostic[] {
    const diagnostics: SubsetDiagnostic[] = [];
    const subProps = sub.properties ?? {};
    const supProps = sup.properties ?? {};
    const subRequired = new Set(sub.required ?? []);
    const subClosed = sub.additionalProperties === false;

    for (const key of sup.required ?? []) {
        if (!(key in subProps)) {
            diagnostics.push({
                level: subClosed ? "error" : "warning",
                path: [...path, key],
                message: subClosed
                    ? `Definitely invalid: required property "${key}" is never provided.`
                    : `Possibly invalid: required property "${key}" may be missing.`,
            });
        }
    }

    const patternProps = sup.patternProperties ?? {};
    for (const key of Object.keys(subProps)) {
        if (key in supProps) {
            continue;
        }
        const patternKey = Object.keys(patternProps).find((pattern) =>
            matchesPattern(pattern, key),
        );
        if (patternKey) {
            diagnostics.push(
                ...getDiagnostics(
                    subProps[key] as JSONSchema7Definition,
                    patternProps[patternKey] as JSONSchema7Definition,
                    [...path, key],
                ),
            );
            continue;
        }
        const additional = sup.additionalProperties;
        if (additional === false) {
            const alwaysPresent = subRequired.has(key);
            diagnostics.push({
                level: alwaysPresent ? "error" : "warning",
                path: [...path, key],
                message: alwaysPresent
                    ? `Definitely invalid: property "${key}" is not permitted by the target schema.`
                    : `Possibly invalid: property "${key}" may not be permitted by the target schema.`,
            });
        } else if (additional && typeof additional === "object") {
            diagnostics.push(
                ...getDiagnostics(
                    subProps[key] as JSONSchema7Definition,
                    additional,
                    [...path, key],
                ),
            );
        }
    }

    for (const key of Object.keys(supProps)) {
        if (key in subProps) {
            diagnostics.push(
                ...getDiagnostics(
                    subProps[key] as JSONSchema7Definition,
                    supProps[key] as JSONSchema7Definition,
                    [...path, key],
                ),
            );
        }
    }

    if (
        diagnostics.length === 0 &&
        (hasUnhandledKeyword(sub, HANDLED_OBJECT_KEYWORDS) ||
            hasUnhandledKeyword(sup, HANDLED_OBJECT_KEYWORDS))
    ) {
        const relationship = classify(sub, sup);
        if (relationship !== "subset") {
            diagnostics.push(leaf(sub, sup, path, relationship));
        }
    }
    return diagnostics;
}

function arrayDiagnostics(
    sub: JSONSchema7,
    sup: JSONSchema7,
    path: (string | number)[],
): SubsetDiagnostic[] {
    const diagnostics: SubsetDiagnostic[] = [];
    const subItems = sub.items;
    const supItems = sup.items;

    if (Array.isArray(subItems) && Array.isArray(supItems)) {
        const shared = Math.min(subItems.length, supItems.length);
        for (let i = 0; i < shared; i++) {
            const subItem = subItems[i];
            const supItem = supItems[i];
            if (subItem === undefined || supItem === undefined) {
                continue;
            }
            diagnostics.push(
                ...getDiagnostics(subItem, supItem, [...path, "items", i]),
            );
        }
    } else if (
        subItems &&
        supItems &&
        !Array.isArray(subItems) &&
        !Array.isArray(supItems) &&
        typeof subItems === "object" &&
        typeof supItems === "object"
    ) {
        diagnostics.push(
            ...getDiagnostics(subItems, supItems, [...path, "items"]),
        );
    }

    if (
        diagnostics.length === 0 &&
        (hasUnhandledKeyword(sub, HANDLED_ARRAY_KEYWORDS) ||
            hasUnhandledKeyword(sup, HANDLED_ARRAY_KEYWORDS))
    ) {
        const relationship = classify(sub, sup);
        if (relationship !== "subset") {
            diagnostics.push(leaf(sub, sup, path, relationship));
        }
    }
    return diagnostics;
}

function leaf(
    sub: JSONSchema7Definition,
    sup: JSONSchema7Definition,
    path: (string | number)[],
    relationship: Relationship,
): SubsetDiagnostic {
    const from = describe(sub);
    const to = describe(sup);
    return relationship === "disjoint"
        ? {
              level: "error",
              path,
              message: `Definitely invalid: ${from} can never satisfy ${to}.`,
          }
        : {
              level: "warning",
              path,
              message: `Possibly invalid: some ${from} values will not satisfy ${to}.`,
          };
}

/**
 * Compares the value sets of two ref-free, normalized schemas: `subset` when
 * every `sub` value satisfies `sup`, `disjoint` when none can, `overlap`
 * otherwise. An unconstrained target (unknown/unsupported) accepts anything; an
 * unknown source might violate a constrained target.
 */
function classify(
    sub: JSONSchema7Definition,
    sup: JSONSchema7Definition,
): Relationship {
    if (typeof sub === "object" && "const" in sub) {
        return validateValue(sub.const, sup).valid ? "subset" : "disjoint";
    }
    const supType = toType(sup);
    if (!supType) {
        return "subset";
    }
    const subType = toType(sub);
    if (!subType) {
        return "overlap";
    }
    if (subType.extends(supType)) {
        return "subset";
    }
    return subType.overlaps(supType) ? "overlap" : "disjoint";
}

/** A single validation failure from the full JSON-Schema validator. */
export interface ValueError {
    path?: (string | number)[],
    error?: string;
}

/** Result of validating a concrete value against a schema. */
export interface ValidationResult {
    valid: boolean;
    errors: ValueError[];
}

/**
 * Reports a literal (`const`) value's mismatch against the target, localizing to
 * the failing sub-path and quoting the validator's reason.
 */
function constDiagnostics(
    value: unknown,
    sup: JSONSchema7Definition,
    path: (string | number)[],
): SubsetDiagnostic[] {
    const result = validateValue(value, sup);
    if (result.valid) {
        return [];
    }
    const detail = result.errors[0];
    const subPath = detail?.path ?? []
    const reason = detail?.error ?? "does not satisfy the target schema";
    return [
        {
            level: "error",
            path: [...path, ...subPath],
            message: `Definitely invalid: literal value — ${reason}`,
        },
    ];
}

/** Exhaustively validates a concrete value against a (ref-free) schema. */
export function validateValue(
    value: unknown,
    sup: JSONSchema7Definition,
): ValidationResult {
    if (sup === true) {
        return { valid: true, errors: [] };
    }
    if (sup === false) {
        return {
            valid: false,
            errors: [{ path: [], error: "the target schema accepts no value" }],
        };
    }
    try {
        const valid = ajv.validate(sup, value);
        if (valid) {
            return { valid: true, errors: [] };
        }
        const errors: ValueError[] = (ajv.errors ?? []).map((e) => ({
            path: (e.instancePath ?? "")
                .split("/")
                .filter(Boolean) as (string | number)[],
            error: e.message ?? "validation failed",
        }));
        return { valid: false, errors };
    } catch {
        return { valid: true, errors: [] };
    }
}

function matchesPattern(pattern: string, key: string): boolean {
    try {
        return new RegExp(pattern).test(key);
    } catch {
        return false;
    }
}

/**
 * Converts a normalized schema to an arktype `Type`, or `null` when the type is
 * unknown/unconstrained or uses a keyword arktype can't parse (in which case the
 * caller degrades leniently rather than reporting a false positive).
 */
function toType(schema: JSONSchema7Definition): ArkType | null {
    if (schema === true) {
        return jsonSchemaToType(true as never) as unknown as ArkType;
    }
    if (schema === false) {
        return null;
    }
    try {
        return jsonSchemaToType(schema as never) as unknown as ArkType;
    } catch {
        return null;
    }
}

function describe(schema: JSONSchema7Definition): string {
    if (schema === true || schema === false) {
        return "unknown-type";
    }
    const asType = toType(schema);
    if (asType?.expression) {
        return `\`${asType.expression.slice(0, 60)}\``;
    }
    return schema.type ? `\`${String(schema.type)}\`` : "unconstrained";
}

/** Object keywords fully handled by the structural walk in `objectDiagnostics`. */
const HANDLED_OBJECT_KEYWORDS = new Set([
    "type",
    "properties",
    "required",
    "additionalProperties",
    "patternProperties",
]);

/** Array keywords fully handled by the structural walk in `arrayDiagnostics`. */
const HANDLED_ARRAY_KEYWORDS = new Set(["type", "items"]);

/** Keys that carry no validation meaning; a schema with only these is unknown. */
const ANNOTATION_KEYS = new Set([
    "description",
    "title",
    "$comment",
    "examples",
    "default",
    "readOnly",
    "writeOnly",
    "deprecated",
    "badAccess",
    "$id",
    "$anchor",
]);

/**
 * Deep-clones a schema with all internal `$ref`s inlined and unrecognized/empty
 * subschemas normalized to `true` (unknown). External or cyclic refs collapse to
 * `true`. `$defs`/`definitions`/`$schema`/`$ref` metadata is dropped from the
 * output since refs are resolved.
 */
function deref(
    schema: JSONSchema7Definition,
    root: JSONSchema7Definition,
    active: Set<string>,
): JSONSchema7Definition {
    if (typeof schema === "boolean") {
        return schema;
    }
    if (typeof schema.$ref === "string") {
        const ref = schema.$ref;
        if (active.has(ref)) {
            return true;
        }
        const target = resolvePointer(root, ref);
        if (target === undefined) {
            return true;
        }
        return deref(target, root, new Set([...active, ref]));
    }

    // A `type: "null"` node carrying a `badAccess` marker is an inference
    // sentinel, not a real null; treating it as unknown keeps a possibly
    // unresolved reference a warning rather than a definite type error.
    const badAccess = (schema as { badAccess?: unknown }).badAccess;
    if (
        schema.type === "null" &&
        (badAccess === "true" || badAccess === "maybe")
    ) {
        return true;
    }

    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema)) {
        if (
            key === "$ref" ||
            key === "$schema" ||
            key === "$defs" ||
            key === "definitions"
        ) {
            continue;
        }
        if (key === "properties" || key === "patternProperties") {
            out[key] = mapValues(
                value as Record<string, JSONSchema7Definition>,
                (sub) => deref(sub, root, active),
            );
        } else if (key === "anyOf" || key === "oneOf" || key === "allOf") {
            out[key] = (value as JSONSchema7Definition[]).map((sub) =>
                deref(sub, root, active),
            );
        } else if (key === "items") {
            out[key] = Array.isArray(value)
                ? value.map((sub) => deref(sub, root, active))
                : derefChild(value, root, active);
        } else if (
            key === "additionalProperties" ||
            key === "additionalItems" ||
            key === "not" ||
            key === "if" ||
            key === "then" ||
            key === "else" ||
            key === "contains" ||
            key === "propertyNames"
        ) {
            out[key] = derefChild(value, root, active);
        } else {
            out[key] = value;
        }
    }

    return hasValidationKeyword(out) ? (out as JSONSchema7Definition) : true;
}

function derefChild(
    value: unknown,
    root: JSONSchema7Definition,
    active: Set<string>,
): unknown {
    return typeof value === "object" && value !== null
        ? deref(value as JSONSchema7Definition, root, active)
        : value;
}

function hasValidationKeyword(schema: Record<string, unknown>): boolean {
    return Object.keys(schema).some((key) => !ANNOTATION_KEYS.has(key));
}

/** True if `schema` carries a validation keyword outside the `handled` set. */
function hasUnhandledKeyword(
    schema: JSONSchema7,
    handled: Set<string>,
): boolean {
    return Object.keys(schema).some(
        (key) => !handled.has(key) && !ANNOTATION_KEYS.has(key),
    );
}

function resolvePointer(
    root: JSONSchema7Definition,
    ref: string,
): JSONSchema7Definition | undefined {
    if (!ref.startsWith("#")) {
        return undefined;
    }
    const segments = ref
        .slice(1)
        .split("/")
        .filter(Boolean)
        .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));
    let cursor: unknown = root;
    for (const segment of segments) {
        if (cursor && typeof cursor === "object" && segment in cursor) {
            cursor = (cursor as Record<string, unknown>)[segment];
        } else {
            return undefined;
        }
    }
    return cursor as JSONSchema7Definition;
}

function mapValues<T, R>(
    record: Record<string, T>,
    fn: (value: T) => R,
): Record<string, R> {
    return Object.fromEntries(
        Object.entries(record).map(([key, value]) => [key, fn(value)]),
    );
}

function isObjectSchema(schema: JSONSchema7): boolean {
    return schema.type === "object" || (!schema.type && !!schema.properties);
}

function isArraySchema(schema: JSONSchema7): boolean {
    return (
        schema.type === "array" || (!schema.type && schema.items !== undefined)
    );
}

import type {
    JSONSchema7,
    JSONSchema7Definition,
    JSONSchema7TypeName,
} from "json-schema";
import type { JsonSchema } from "../json-schema/from-value";
import { inferJsonSchema } from "../json-schema/from-value";
import {
    compileExpression,
    type ExpressionNode,
    type FunctionNode,
} from "./types";

/**
 * Annotation describing whether an access operation (field/index) is sound.
 * - `"true"`: the access is definitely invalid (reading into a primitive, or a
 *   missing field on a closed object). At runtime JMESPath yields `null`.
 * - `"maybe"`: the access might yield `null` (optional/absent property, list
 *   index that may be out of range, or access into an unknown type).
 * - `"false"`: the access is valid and definitely resolves.
 */
export type BadAccess = "true" | "maybe" | "false";

/**
 * A JSON Schema (draft-7) augmented with a single extra `badAccess` keyword.
 * JSON Schema ignores unknown keywords, so an {@link AnnotatedSchema} remains a
 * valid JSON Schema.
 */
export interface AnnotatedSchema extends JSONSchema7 {
    badAccess?: BadAccess;
    items?: AnnotatedSchema | AnnotatedSchema[];
    properties?: { [key: string]: AnnotatedSchema };
    additionalProperties?: AnnotatedSchema | boolean;
    anyOf?: AnnotatedSchema[];
}

/** A single bad-access finding within an inferred output schema. */
export interface BadAccessDiagnostic {
    badAccess: Exclude<BadAccess, "false">;
    /** JSON path to the annotated subschema within the returned {@link AnnotatedSchema}. */
    path: (string | number)[];
    message: string;
}

/** Result of {@link inferQueryOutputSchema}. */
export interface InferQueryOutputSchemaResult {
    /** The inferred output schema, annotated with `badAccess` markers. */
    schema: AnnotatedSchema;
    /** One entry per bad (`"true"`/`"maybe"`) access found in {@link schema}. */
    diagnostics: BadAccessDiagnostic[];
}

/**
 * Given a JSON Schema describing a hypothetical input object and a JMESPath
 * query string, returns a JSON Schema describing the type of the query's
 * result, augmented with {@link BadAccess} annotations that flag statically
 * detectable bad accesses.
 */
export function inferQueryOutputSchema(
    inputSchema: JSONSchema7Definition,
    query: string,
): InferQueryOutputSchemaResult {
    const root = asSchemaObject(inputSchema);
    const ast = compileExpression(query);
    const functionDiagnostics: BadAccessDiagnostic[] = [];

    const reportArgDiagnostic = (
        fnName: string,
        argIndex: number,
        schema: AnnotatedSchema,
        allowedTypes: JSONSchema7TypeName[],
    ): void => {
        const compat = typeCompatibility(schema, allowedTypes);
        if (compat === "compatible" || compat === "unknown") return;
        const actual = describeSchemaType(schema);
        const expected = formatTypeList(allowedTypes);
        functionDiagnostics.push({
            badAccess: compat === "incompatible" ? "true" : "maybe",
            path: [],
            message:
                compat === "incompatible"
                    ? `${fnName}(): argument ${argIndex + 1} must be ${expected}, got ${actual}.`
                    : `${fnName}(): argument ${argIndex + 1} must be ${expected}, but may receive incompatible type ${actual}.`,
        });
    };

    const reportArrayElementDiagnostic = (
        fnName: string,
        argIndex: number,
        schema: AnnotatedSchema,
        allowedElementTypes: JSONSchema7TypeName[],
        description: string,
    ): void => {
        const arrayCompat = typeCompatibility(schema, ["array"]);
        if (arrayCompat === "unknown") return;
        if (arrayCompat === "incompatible") {
            const actual = describeSchemaType(schema);
            functionDiagnostics.push({
                badAccess: "true",
                path: [],
                message: `${fnName}(): argument ${argIndex + 1} must be ${description}, got ${actual}.`,
            });
            return;
        }
        const items = schema.items;
        if (items === undefined) return;
        if (Array.isArray(items)) {
            let worstCompat: Compatibility = "compatible";
            for (const item of items) {
                const elemCompat = typeCompatibility(
                    asSchemaObject(item),
                    allowedElementTypes,
                );
                if (elemCompat === "unknown") return;
                if (elemCompat === "incompatible") {
                    worstCompat = "incompatible";
                    break;
                }
                if (elemCompat === "maybe" && worstCompat === "compatible") {
                    worstCompat = "maybe";
                }
            }
            if (worstCompat === "compatible") return;
            functionDiagnostics.push({
                badAccess: worstCompat === "incompatible" ? "true" : "maybe",
                path: [],
                message:
                    worstCompat === "incompatible"
                        ? `${fnName}(): argument ${argIndex + 1} must be ${description}, but the array contains incompatible element types.`
                        : `${fnName}(): argument ${argIndex + 1} must be ${description}, but the array may contain incompatible element types.`,
            });
        } else {
            const elemSchema = asSchemaObject(items);
            const elemCompat = typeCompatibility(
                elemSchema,
                allowedElementTypes,
            );
            if (elemCompat === "compatible" || elemCompat === "unknown") return;
            const actual = describeSchemaType(elemSchema);
            functionDiagnostics.push({
                badAccess: elemCompat === "incompatible" ? "true" : "maybe",
                path: [],
                message:
                    elemCompat === "incompatible"
                        ? `${fnName}(): argument ${argIndex + 1} must be ${description}, but the array contains ${actual} elements.`
                        : `${fnName}(): argument ${argIndex + 1} must be ${description}, but the array may contain incompatible ${actual} elements.`,
            });
        }
    };

    const inferNode = (
        node: ExpressionNode,
        schema: AnnotatedSchema,
    ): AnnotatedSchema => {
        switch (node.type) {
            case "Field":
                return accessWithNormalization(schema, (s) =>
                    fieldAccess(s, node.name),
                );
            case "Index":
                return accessWithNormalization(schema, (s) =>
                    indexAccess(s, node.value as number),
                );
            case "Slice":
                return accessWithNormalization(schema, sliceAccess);
            case "Subexpression":
            case "IndexExpression":
            case "Pipe":
                return inferNode(
                    node.children[1],
                    asSchemaObject(inferNode(node.children[0], schema)),
                );
            case "Projection": {
                const base = asSchemaObject(
                    inferNode(node.children[0], schema),
                );
                if (isArraySchema(base)) {
                    return {
                        type: "array",
                        items: inferNode(node.children[1], arrayElement(base)),
                        badAccess: "false",
                    };
                }
                // string slicing produces a Projection over a string base
                if (singleType(base) === "string") {
                    return { type: "string", badAccess: "false" };
                }
                return badNull();
            }
            case "ValueProjection": {
                const base = asSchemaObject(
                    inferNode(node.children[0], schema),
                );
                if (isObjectSchema(base)) {
                    return {
                        type: "array",
                        items: inferNode(
                            node.children[1],
                            objectValueUnion(base),
                        ),
                        badAccess: "false",
                    };
                }
                return badNull();
            }
            case "FilterProjection": {
                const base = asSchemaObject(
                    inferNode(node.children[0], schema),
                );
                if (!isArraySchema(base)) {
                    return badNull();
                }
                return {
                    type: "array",
                    items: inferNode(node.children[1], arrayElement(base)),
                    badAccess: "false",
                };
            }
            case "Flatten": {
                const base = asSchemaObject(
                    inferNode(node.children[0], schema),
                );
                if (!isArraySchema(base)) {
                    return badNull();
                }
                const element = arrayElement(base);
                const items = isArraySchema(element)
                    ? arrayElement(element)
                    : element;
                return { type: "array", items, badAccess: "false" };
            }
            case "MultiSelectList":
                return {
                    type: "array",
                    items: node.children.map((child) =>
                        inferNode(child, schema),
                    ),
                    badAccess: "false",
                };
            case "MultiSelectHash": {
                const properties: { [key: string]: AnnotatedSchema } = {};
                const required: string[] = [];
                for (const pair of node.children) {
                    properties[pair.name] = inferNode(
                        pair.value as ExpressionNode,
                        schema,
                    );
                    required.push(pair.name);
                }
                return {
                    type: "object",
                    properties,
                    required,
                    badAccess: "false",
                };
            }
            case "Identity":
            case "Current":
                return ensureBadAccess(asSchemaObject(schema), "false");
            case "Literal":
                return {
                    ...asSchemaObject(inferJsonSchema(node.value)),
                    badAccess: "false",
                };
            case "Comparator":
            case "NotExpression":
                return { type: "boolean", badAccess: "false" };
            case "AndExpression":
            case "OrExpression":
                return ensureBadAccess(
                    unionSchemas([
                        inferNode(node.children[0], schema),
                        inferNode(node.children[1], schema),
                    ]),
                    "false",
                );
            case "Function":
                return ensureBadAccess(
                    inferFunction(node as FunctionNode, schema),
                    "false",
                );
            default:
                // ExpressionReference and anything unhandled resolve to an
                // unknown type.
                return { badAccess: "false" };
        }
    };

    const inferFunction = (
        node: FunctionNode,
        schema: AnnotatedSchema,
    ): AnnotatedSchema => {
        const args = node.children;
        const argSchema = (index: number): AnnotatedSchema => {
            const arg = args[index];
            return arg ? asSchemaObject(inferNode(arg, schema)) : {};
        };

        switch (node.name) {
            case "abs":
            case "ceil":
            case "floor":
                reportArgDiagnostic(node.name, 0, argSchema(0), ["number"]);
                return { type: "number" };
            case "avg":
            case "sum":
                reportArrayElementDiagnostic(
                    node.name,
                    0,
                    argSchema(0),
                    ["number"],
                    "an array of numbers",
                );
                return { type: "number" };
            case "length":
                reportArgDiagnostic(node.name, 0, argSchema(0), [
                    "string",
                    "array",
                    "object",
                ]);
                return { type: "number" };
            case "to_number":
                return { type: "number" };
            case "find_first":
            case "find_last":
                return { anyOf: [{ type: "number" }, { type: "null" }] };
            case "lower":
            case "upper":
            case "trim":
            case "trim_left":
            case "trim_right":
                reportArgDiagnostic(node.name, 0, argSchema(0), ["string"]);
                return { type: "string" };
            case "join":
                reportArgDiagnostic(node.name, 0, argSchema(0), ["string"]);
                reportArrayElementDiagnostic(
                    node.name,
                    1,
                    argSchema(1),
                    ["string"],
                    "an array of strings",
                );
                return { type: "string" };
            case "pad_left":
            case "pad_right":
            case "replace":
            case "to_string":
            case "type":
                return { type: "string" };
            case "contains":
                reportArgDiagnostic(node.name, 0, argSchema(0), [
                    "string",
                    "array",
                ]);
                return { type: "boolean" };
            case "ends_with":
            case "starts_with":
                reportArgDiagnostic(node.name, 0, argSchema(0), ["string"]);
                reportArgDiagnostic(node.name, 1, argSchema(1), ["string"]);
                return { type: "boolean" };
            case "split":
                return { type: "array", items: { type: "string" } };
            case "keys":
                reportArgDiagnostic(node.name, 0, argSchema(0), ["object"]);
                return { type: "array", items: { type: "string" } };
            case "items":
            case "zip":
                return { type: "array", items: { type: "array" } };
            case "from_items":
            case "group_by":
                return { type: "object" };
            case "merge": {
                const properties: { [key: string]: AnnotatedSchema } = {};
                for (let i = 0; i < args.length; i++) {
                    const arg = argSchema(i);
                    if (isObjectSchema(arg) && arg.properties) {
                        Object.assign(properties, arg.properties);
                    }
                }
                return { type: "object", properties };
            }
            case "values": {
                const arg = argSchema(0);
                reportArgDiagnostic(node.name, 0, arg, ["object"]);
                return { type: "array", items: objectValueUnion(arg) };
            }
            case "reverse": {
                const arg = argSchema(0);
                reportArgDiagnostic(node.name, 0, arg, ["string", "array"]);
                if (singleType(arg) === "string") {
                    return { type: "string" };
                }
                return { type: "array", items: arrayElement(arg) };
            }
            case "sort": {
                const arg = argSchema(0);
                reportArrayElementDiagnostic(
                    node.name,
                    0,
                    arg,
                    ["string", "number"],
                    "an array of strings or numbers",
                );
                return { type: "array", items: arrayElement(arg) };
            }
            case "sort_by":
                return { type: "array", items: arrayElement(argSchema(0)) };
            case "to_array": {
                const arg = argSchema(0);
                if (isArraySchema(arg)) {
                    return arg;
                }
                return { type: "array", items: arg };
            }
            case "max":
            case "min":
            case "max_by":
            case "min_by":
                return arrayElement(argSchema(0));
            case "not_null":
                return unionSchemas(args.map((_, index) => argSchema(index)));
            case "map": {
                const arrayArg = argSchema(1);
                const element = arrayElement(arrayArg);
                const exprNode = args[0];
                if (!exprNode) {
                    return { type: "array" };
                }
                const child =
                    exprNode.type === "ExpressionReference"
                        ? exprNode.children[0]
                        : exprNode;
                return {
                    type: "array",
                    items: inferNode(child, element),
                };
            }
            default:
                return {};
        }
    };

    const schema = ensureBadAccess(
        asSchemaObject(inferNode(ast, root)),
        "false",
    );
    const diagnostics: BadAccessDiagnostic[] = [];
    collectDiagnostics(schema, [], diagnostics);
    diagnostics.push(...functionDiagnostics);
    return { schema, diagnostics };
}

/**
 * Walks an inferred schema depth-first, emitting a {@link BadAccessDiagnostic}
 * for every subschema annotated with a `"true"` or `"maybe"` `badAccess`.
 */
function collectDiagnostics(
    schema: AnnotatedSchema,
    path: (string | number)[],
    diagnostics: BadAccessDiagnostic[],
): void {
    if (schema.badAccess && schema.badAccess !== "false") {
        diagnostics.push({
            badAccess: schema.badAccess,
            path,
            message:
                schema.badAccess === "true"
                    ? "Invalid access: always resolves to null."
                    : "Possibly-invalid access: may resolve to null.",
        });
    }
    if (Array.isArray(schema.items)) {
        schema.items.forEach((item, index) => {
            collectDiagnostics(
                asSchemaObject(item),
                [...path, "items", index],
                diagnostics,
            );
        });
    } else if (schema.items !== undefined) {
        collectDiagnostics(
            asSchemaObject(schema.items),
            [...path, "items"],
            diagnostics,
        );
    }
    if (schema.properties) {
        for (const [key, value] of Object.entries(schema.properties)) {
            collectDiagnostics(
                asSchemaObject(value),
                [...path, "properties", key],
                diagnostics,
            );
        }
    }
    if (
        schema.additionalProperties &&
        typeof schema.additionalProperties === "object"
    ) {
        collectDiagnostics(
            asSchemaObject(schema.additionalProperties),
            [...path, "additionalProperties"],
            diagnostics,
        );
    }
    for (const key of ["anyOf", "oneOf"] as const) {
        const branches = schema[key];
        if (Array.isArray(branches)) {
            branches.forEach((branch, index) => {
                collectDiagnostics(
                    asSchemaObject(branch),
                    [...path, key, index],
                    diagnostics,
                );
            });
        }
    }
}

function fieldAccess(schema: AnnotatedSchema, name: string): AnnotatedSchema {
    if (!isObjectSchema(schema)) {
        return badNull();
    }
    const properties = schema.properties ?? {};
    if (Object.hasOwn(properties, name)) {
        const propSchema = asSchemaObject(properties[name]);
        const required =
            Array.isArray(schema.required) && schema.required.includes(name);
        return withBadAccess(propSchema, required ? "false" : "maybe");
    }
    const additional = schema.additionalProperties;
    if (additional && typeof additional === "object") {
        return withBadAccess(asSchemaObject(additional), "maybe");
    }
    if (additional === true || !schema.properties) {
        // open object: the value is unknown and may be absent
        return { badAccess: "maybe" };
    }
    // closed object: the field is not declared
    return badNull();
}

function indexAccess(schema: AnnotatedSchema, value: number): AnnotatedSchema {
    if (!isArraySchema(schema)) {
        return badNull();
    }
    const items = schema.items;
    if (Array.isArray(items)) {
        // tuple: a known length, so an in-range index is a definite access
        const index = value < 0 ? items.length + value : value;
        if (index >= 0 && index < items.length) {
            return withBadAccess(asSchemaObject(items[index]), "false");
        }
        return badNull();
    }
    if (items !== undefined) {
        // list: the index may be out of range
        return withBadAccess(asSchemaObject(items), "maybe");
    }
    return { badAccess: "maybe" };
}

function sliceAccess(schema: AnnotatedSchema): AnnotatedSchema {
    if (isArraySchema(schema)) {
        return {
            type: "array",
            items: arrayElement(schema),
            badAccess: "false",
        };
    }
    if (singleType(schema) === "string") {
        return { type: "string", badAccess: "false" };
    }
    return badNull();
}

/**
 * Applies a single-schema access rule, first handling unknown and union
 * (multi-type / `anyOf` / `oneOf`) schemas.
 */
function accessWithNormalization(
    schema: AnnotatedSchema,
    single: (s: AnnotatedSchema) => AnnotatedSchema,
): AnnotatedSchema {
    const s = asSchemaObject(schema);
    if (isUnknown(s)) {
        return { type: "null", badAccess: "maybe" };
    }
    const members = unionMembers(s);
    if (members) {
        const accessed = members.map(single);
        // Member markers are cleared and the verdict reported once here, so a
        // single failing alternative (e.g. the `null` arm of a nullable union)
        // reads as possibly-invalid rather than definitely so.
        const everyMemberFails = accessed.every(
            (member) => member.badAccess === "true",
        );
        return {
            anyOf: accessed.map((member) => ({
                ...member,
                badAccess: "false" as const,
            })),
            badAccess: everyMemberFails ? "true" : "maybe",
        };
    }
    return single(s);
}

function unionMembers(schema: AnnotatedSchema): AnnotatedSchema[] | null {
    const alternatives = schema.anyOf ?? schema.oneOf;
    if (Array.isArray(alternatives) && alternatives.length > 0) {
        return alternatives.map(asSchemaObject);
    }
    if (Array.isArray(schema.type) && schema.type.length > 1) {
        const { anyOf: _anyOf, oneOf: _oneOf, type, ...rest } = schema;
        return type.map((typeName) => ({ ...rest, type: typeName }));
    }
    return null;
}

function isUnknown(schema: AnnotatedSchema): boolean {
    if (unionMembers(schema)) {
        return false;
    }
    if (singleType(schema)) {
        return false;
    }
    if (schema.properties || schema.additionalProperties !== undefined) {
        return false;
    }
    if (schema.items !== undefined) {
        return false;
    }
    return true;
}

type Compatibility = "compatible" | "maybe" | "incompatible" | "unknown";

function typeCompatibility(
    schema: AnnotatedSchema,
    allowedTypes: JSONSchema7TypeName[],
): Compatibility {
    if (isUnknown(schema)) return "unknown";
    // A null with a badAccess marker is the "unknown value" sentinel produced
    // by accessing into an unknown or invalid schema — not a real null type.
    if (
        singleType(schema) === "null" &&
        schema.badAccess &&
        schema.badAccess !== "false"
    ) {
        return "unknown";
    }

    const members = unionMembers(schema);
    if (members) {
        let allCompatible = true;
        let allIncompatible = true;
        for (const m of members) {
            const r = typeCompatibility(m, allowedTypes);
            if (r === "unknown") return "unknown";
            if (r !== "compatible") allCompatible = false;
            if (r !== "incompatible") allIncompatible = false;
        }
        if (allIncompatible) return "incompatible";
        if (allCompatible) return "compatible";
        return "maybe";
    }

    const type = singleType(schema);
    if (!type) return "unknown";
    return allowedTypes.includes(type) ? "compatible" : "incompatible";
}

function formatTypeList(types: JSONSchema7TypeName[]): string {
    if (types.length <= 2) return types.join(" or ");
    return `${types.slice(0, -1).join(", ")}, or ${types.at(-1)}`;
}

function describeSchemaType(schema: AnnotatedSchema): string {
    const type = singleType(schema);
    if (type) return type;

    const members = unionMembers(schema);
    if (members) {
        return members.map(describeSchemaType).join(" | ");
    }

    if (isArraySchema(schema)) return "array";
    if (isObjectSchema(schema)) return "object";
    return "unknown";
}

function asSchemaObject(definition: JsonSchema | undefined): AnnotatedSchema {
    if (
        definition === undefined ||
        definition === true ||
        definition === false
    ) {
        return {};
    }
    return definition as AnnotatedSchema;
}

function singleType(schema: AnnotatedSchema): JSONSchema7TypeName | undefined {
    if (typeof schema.type === "string") {
        return schema.type;
    }
    if (Array.isArray(schema.type) && schema.type.length === 1) {
        return schema.type[0];
    }
    return undefined;
}

function isObjectSchema(schema: AnnotatedSchema): boolean {
    const type = singleType(schema);
    if (type === "object") {
        return true;
    }
    if (type !== undefined) {
        return false;
    }
    return Boolean(
        schema.properties || schema.additionalProperties !== undefined,
    );
}

function isArraySchema(schema: AnnotatedSchema): boolean {
    const type = singleType(schema);
    if (type === "array") {
        return true;
    }
    if (type !== undefined) {
        return false;
    }
    return schema.items !== undefined;
}

function arrayElement(schema: AnnotatedSchema): AnnotatedSchema {
    const items = schema.items;
    if (Array.isArray(items)) {
        return unionSchemas(items.map(asSchemaObject));
    }
    if (items !== undefined) {
        return asSchemaObject(items);
    }
    return {};
}

function objectValueUnion(schema: AnnotatedSchema): AnnotatedSchema {
    const values = Object.values(schema.properties ?? {}).map(asSchemaObject);
    const additional = schema.additionalProperties;
    if (additional && typeof additional === "object") {
        values.push(asSchemaObject(additional));
    }
    if (values.length === 0) {
        return {};
    }
    return unionSchemas(values);
}

export function unionSchemas(schemas: JsonSchema[]): AnnotatedSchema {
    const byShape = new Map<string, AnnotatedSchema>();
    for (const schema of schemas.map(asSchemaObject)) {
        byShape.set(JSON.stringify(schema), schema);
    }
    const distinct = [...byShape.values()];
    if (distinct.length === 1 && distinct[0]) {
        return distinct[0];
    }
    return { anyOf: distinct };
}

function withBadAccess(
    schema: AnnotatedSchema,
    badAccess: BadAccess,
): AnnotatedSchema {
    return { ...schema, badAccess };
}

function ensureBadAccess(
    schema: AnnotatedSchema,
    badAccess: BadAccess,
): AnnotatedSchema {
    return schema.badAccess ? schema : { ...schema, badAccess };
}

function badNull(): AnnotatedSchema {
    return { type: "null", badAccess: "true" };
}

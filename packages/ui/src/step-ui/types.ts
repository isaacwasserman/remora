import type { StepType } from "@remoraflow/core";
import type { JSONSchema7 } from "json-schema";
import type { LucideIcon } from "lucide-react";
import type { FieldKind, FieldValueByKind, KindsFor } from "./field-kinds";
import type { ParamKey, StepParams } from "./params";
import type { ToneKey } from "./tones";

export type WorkflowExtra = "inputSchema" | "outputSchema";

export interface FieldSpecBase<V> {
    label: string;
    /** Value seeded into a newly created step; null leaves the param unset. */
    initial: V | null;
    blurb?: string;
    /** JSON Schema hint (numeric bounds, enum, description) for expression editors. */
    schemaHint?: JSONSchema7;
    renderIf?: (step: unknown) => boolean;
}

export type FieldOptionsByKind = {
    expression: {
        // Literal-only editors render the compact widget instead of the full
        // expression editor.
        allowJmespath?: boolean;
        allowTemplate?: boolean;
    };
    "template-text": object;
    identifier: object;
    "step-ref": object;
    "tool-ref": object;
    "tool-ref-list": object;
    "json-schema": object;
    "schema-map": object;
    "expression-map": object;
    "case-list": object;
    boolean: object;
    constant: { options: readonly string[] };
};

export type FieldSpec<V> = {
    [K in KindsFor<V>]: FieldSpecBase<V> & { kind: K } & FieldOptionsByKind[K];
}[KindsFor<V>];

export type FieldMap<T extends StepType> = [ParamKey<T>] extends [never]
    ? Record<string, never>
    : { [K in keyof StepParams<T>]: FieldSpec<StepParams<T>[K]> };

export interface StepUi<T extends StepType> {
    label: string;
    icon: LucideIcon;
    tone: ToneKey;
    blurb: string;
    paletteOrder: number;
    fields: FieldMap<T>;
    order: readonly ParamKey<T>[];
    advanced?: readonly ParamKey<T>[];
    nodeRows?: readonly ParamKey<T>[];
    headerRows?: readonly ParamKey<T>[];
    /** `end` only: the whole params object is opt-in. */
    paramsOptional?: true;
    workflowExtras?: readonly WorkflowExtra[];
}

export type AnyFieldSpec = FieldSpec<FieldValueByKind[keyof FieldValueByKind]>;

export type { FieldKind, FieldValueByKind };

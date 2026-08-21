import type { Expression, WorkflowStep } from "@remoraflow/core";
import type { JSONSchema7 } from "json-schema";

export type SwitchCase = Extract<
    WorkflowStep,
    { type: "switch-case" }
>["params"]["cases"][number];

export type FieldValueByKind = {
    expression: Expression;
    "template-text": string;
    identifier: string;
    "step-ref": string;
    "tool-ref": string;
    "tool-ref-list": readonly string[];
    "json-schema": JSONSchema7;
    "schema-map": Record<string, JSONSchema7>;
    "expression-map": Record<string, Expression>;
    "case-list": readonly SwitchCase[];
    boolean: boolean;
    constant: string;
};

export type FieldKind = keyof FieldValueByKind;

// The tuple wrapper is load-bearing: `Expression` is a 3-member union and a
// naked conditional would distribute and collapse every kind to `never`.
export type KindsFor<V> = {
    [K in FieldKind]: [V] extends [FieldValueByKind[K]] ? K : never;
}[FieldKind];

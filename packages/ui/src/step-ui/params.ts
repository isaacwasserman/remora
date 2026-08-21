import type { StepOfType, StepType } from "@remoraflow/core";

// Inference against an optional property is the only form that resolves for
// both shapes (`start` has no `params` key at all); `"params" extends keyof T`
// does not narrow.
export type RawParams<T extends StepType> =
    StepOfType<T> extends { params?: infer P } ? NonNullable<P> : never;

export type StepParams<T extends StepType> = Required<RawParams<T>>;

export type ParamKey<T extends StepType> = [RawParams<T>] extends [never]
    ? never
    : keyof StepParams<T> & string;

export type OptionalParamKeys<T extends StepType> = {
    [K in keyof StepParams<T>]: undefined extends StepParams<T>[K] ? K : never;
} extends infer O
    ? { [K in keyof O & string]: O[K] }
    : never;

import type { StepOfType, StepType, WorkflowStep } from "@remoraflow/core";
import type { ParamKey, RawParams } from "./params";

// For a generic T, StepOfType<T> is an unresolved conditional and TS cannot
// prove a spread reconstructs the union member; these three casts are the
// contained seam (core uses the same pattern in step-registry.ts). Every
// call site is cast-free.
export function readParam<T extends StepType>(
    step: WorkflowStep,
    key: ParamKey<T>,
): RawParams<T>[ParamKey<T>] | undefined {
    return (step as StepOfType<T> as { params?: RawParams<T> }).params?.[key];
}

export function writeParam<T extends StepType>(
    step: WorkflowStep,
    key: ParamKey<T>,
    value: unknown,
): WorkflowStep {
    const params = { ...(step as StepOfType<T> as { params?: object }).params };
    (params as Record<string, unknown>)[key] = value;
    return { ...step, params } as WorkflowStep;
}

export function clearParam<T extends StepType>(
    step: WorkflowStep,
    key: ParamKey<T>,
): WorkflowStep {
    const params = { ...(step as StepOfType<T> as { params?: object }).params };
    delete (params as Record<string, unknown>)[key];
    return { ...step, params } as WorkflowStep;
}

export function withUi<T extends StepType>(
    step: WorkflowStep,
    _type: T,
    update: (params: RawParams<T>) => RawParams<T>,
): WorkflowStep {
    const params = (step as StepOfType<T> as { params?: RawParams<T> }).params;
    return {
        ...step,
        params: update(params ?? ({} as RawParams<T>)),
    } as unknown as WorkflowStep;
}

import {
    type ConstrainedParameter,
    constrainedParameters,
    type RemoraflowSettings,
    remoraflowSettingsSchema,
    resolveDurationLimits,
    type WorkflowStep,
} from "@remoraflow/core";
import type { JSONSchema7 } from "json-schema";

const DEFAULTS = remoraflowSettingsSchema.assert({});
const _DEFAULT_LIMITS = resolveDurationLimits(DEFAULTS.duration);

function boundsFor(
    constrained: ConstrainedParameter,
    resolved: typeof DEFAULTS,
): { min?: number; max?: number } {
    if (constrained.bound.source === "duration-limits") {
        const limits = resolveDurationLimits(resolved.duration);
        const seconds = limits[constrained.bound.key as keyof typeof limits];
        const value = seconds * constrained.multiplier;
        return constrained.direction === "max"
            ? { max: value }
            : { min: value };
    }
    const steps =
        resolved.tokenBudgets[constrained.bound.key as "maxAgentSteps"];
    return constrained.direction === "max"
        ? { max: steps * constrained.multiplier }
        : { min: steps * constrained.multiplier };
}

export function constraintHints(
    step: WorkflowStep,
    settings?: RemoraflowSettings,
): Map<string, JSONSchema7> {
    const resolved = settings
        ? remoraflowSettingsSchema.assert(settings)
        : DEFAULTS;
    const hints = new Map<string, JSONSchema7>();
    for (const constrained of constrainedParameters(step)) {
        const key = constrained.path[constrained.path.length - 1];
        if (typeof key !== "string") continue;
        const { min, max } = boundsFor(constrained, resolved);
        hints.set(key, {
            type: "number",
            ...(min !== undefined && { minimum: min }),
            ...(max !== undefined && { maximum: max }),
        });
    }
    return hints;
}

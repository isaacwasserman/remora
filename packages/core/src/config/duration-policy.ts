import type { ResolvedRemoraflowSettings } from "../types";

export type DurationPolicy = ResolvedRemoraflowSettings["duration"];

/**
 * The effective duration bounds, in seconds. Distinct from {@link DurationPolicy}
 * because bounds compose — a sleep cannot outlast the wait budget containing it,
 * and no wait can outlast the run — and this is the only place that composition
 * is expressed. The validator, the schema factory, and the runtime all read
 * these rather than the raw policy, so a bound cannot mean one thing at
 * authoring time and another at execution time.
 */
export type DurationLimits = {
    maxDurationSeconds: number;
    maxExecutionSeconds: number;
    maxWaitSeconds: number;
    maxSleepSeconds: number;
    maxStepExecutionSeconds: number;
    minPollIntervalSeconds: number;
};

export function resolveDurationLimits(policy: DurationPolicy): DurationLimits {
    const maxWaitSeconds = Math.min(
        policy.maxWaitSeconds,
        policy.maxDurationSeconds,
    );
    return {
        maxDurationSeconds: policy.maxDurationSeconds,
        maxExecutionSeconds: policy.maxExecutionSeconds,
        maxWaitSeconds,
        maxSleepSeconds: Math.min(policy.maxSleepSeconds, maxWaitSeconds),
        maxStepExecutionSeconds: Math.min(
            policy.maxStepExecutionSeconds,
            policy.maxExecutionSeconds,
        ),
        minPollIntervalSeconds: policy.minPollIntervalSeconds,
    };
}

/**
 * Coerces an authored duration into `[0, max]`. Authored durations come from
 * arbitrary expressions, so a NaN or negative value collapses to zero rather
 * than propagating into deadline arithmetic. `Infinity` is not an error — it is
 * how a caller states "no bound of my own", and clamping it yields `max`.
 */
export function clampSeconds(seconds: number, max: number): number {
    if (Number.isNaN(seconds) || seconds < 0) {
        return 0;
    }
    return Math.min(seconds, max);
}

/** Raises an authored duration to `min`. Only NaN is absorbed. */
export function floorSeconds(seconds: number, min: number): number {
    if (Number.isNaN(seconds)) {
        return min;
    }
    return Math.max(seconds, min);
}

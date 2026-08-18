import { describe, expect, test } from "bun:test";
import { remoraflowSettingsSchema } from "../../types";
import {
    clampSeconds,
    type DurationPolicy,
    floorSeconds,
    resolveDurationLimits,
} from "./duration-policy";

function policy(overrides: Record<string, number> = {}): DurationPolicy {
    return remoraflowSettingsSchema.assert({ duration: overrides }).duration;
}

describe("resolveDurationLimits", () => {
    test("passes a policy through when no bound constrains another", () => {
        const shipped = policy();
        expect(resolveDurationLimits(shipped)).toEqual({
            maxDurationSeconds: shipped.maxDurationSeconds,
            maxExecutionSeconds: shipped.maxExecutionSeconds,
            maxWaitSeconds: shipped.maxWaitSeconds,
            maxSleepSeconds: shipped.maxSleepSeconds,
            maxStepExecutionSeconds: shipped.maxStepExecutionSeconds,
            minPollIntervalSeconds: shipped.minPollIntervalSeconds,
        });
    });

    test("a sleep cannot outlast the wait budget containing it", () => {
        const limits = resolveDurationLimits(
            policy({ maxSleepSeconds: 900, maxWaitSeconds: 300 }),
        );
        expect(limits.maxSleepSeconds).toBe(300);
    });

    test("a wait cannot outlast the run, and the sleep bound follows it down", () => {
        // Composition has to cascade: capping the wait without also capping the
        // sleep would leave a sleep able to outlast the run that contains it.
        const limits = resolveDurationLimits(
            policy({
                maxDurationSeconds: 120,
                maxWaitSeconds: 600,
                maxSleepSeconds: 600,
            }),
        );
        expect(limits.maxWaitSeconds).toBe(120);
        expect(limits.maxSleepSeconds).toBe(120);
    });

    test("one step cannot outlast the whole execution budget", () => {
        const limits = resolveDurationLimits(
            policy({ maxStepExecutionSeconds: 900, maxExecutionSeconds: 60 }),
        );
        expect(limits.maxStepExecutionSeconds).toBe(60);
    });

    test("the poll floor is carried through untouched", () => {
        // A minimum, so it is the one bound nothing else can lower.
        expect(
            resolveDurationLimits(
                policy({ minPollIntervalSeconds: 5, maxWaitSeconds: 1 }),
            ).minPollIntervalSeconds,
        ).toBe(5);
    });
});

describe("clampSeconds", () => {
    test("leaves a duration inside the bound alone", () => {
        expect(clampSeconds(30, 60)).toBe(30);
    });

    test("caps a duration past the bound", () => {
        expect(clampSeconds(90, 60)).toBe(60);
    });

    test.each([
        ["negative", -5],
        ["NaN", Number.NaN],
        ["-Infinity", Number.NEGATIVE_INFINITY],
    ])("absorbs a %s duration to zero", (_label, seconds) => {
        // Authored durations come from arbitrary expressions; letting one of
        // these reach deadline arithmetic produces a NaN deadline that every
        // comparison against it silently fails.
        expect(clampSeconds(seconds, 60)).toBe(0);
    });

    test("clamps Infinity down to the bound rather than to zero", () => {
        // Callers pass Infinity to mean "no bound of my own, use the policy's".
        // Treating it as garbage would turn an unbounded wait into an instant
        // timeout — the opposite of what was asked for.
        expect(clampSeconds(Number.POSITIVE_INFINITY, 60)).toBe(60);
    });
});

describe("floorSeconds", () => {
    test("leaves a duration above the floor alone", () => {
        expect(floorSeconds(30, 5)).toBe(30);
    });

    test("raises a duration below the floor", () => {
        expect(floorSeconds(1, 5)).toBe(5);
    });

    test.each([
        ["NaN", Number.NaN],
        ["-Infinity", Number.NEGATIVE_INFINITY],
    ])("raises a %s duration to the floor", (_label, seconds) => {
        expect(floorSeconds(seconds, 5)).toBe(5);
    });

    test("leaves Infinity above the floor", () => {
        // Collapsing an unbounded interval to the floor would turn the slowest
        // possible polling into the fastest.
        expect(floorSeconds(Number.POSITIVE_INFINITY, 5)).toBe(
            Number.POSITIVE_INFINITY,
        );
    });
});

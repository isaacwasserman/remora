import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import {
    type DurationLimits,
    resolveDurationLimits,
} from "../../duration-policy";
import { remoraflowOptionsSchema } from "../../types";
import { createCheckpointingExecutionEngine } from "./checkpointing";
import { testingOnly_createInMemoryCheckpointStore } from "./checkpointing/in-memory-store";
import type { CheckpointStore } from "./checkpointing/types";
import { createDurationBudget } from "./duration-budget";
import { DurationLimitExceededError } from "./errors";
import { createInMemoryExecutionEngine } from "./in-memory";

function limits(overrides: Record<string, number> = {}): DurationLimits {
    return resolveDurationLimits(
        remoraflowOptionsSchema.assert({ durationPolicy: overrides })
            .durationPolicy,
    );
}

/** A budget over a throwaway run, for the clocks that need no replay. */
function budgetWith(overrides: Record<string, number> = {}) {
    const run = createInMemoryExecutionEngine().createRun();
    return createDurationBudget(run, limits(overrides));
}

function resumableBudget(
    store: CheckpointStore,
    overrides: Record<string, number> = {},
) {
    const run = createCheckpointingExecutionEngine(store).createRun("r");
    return createDurationBudget(run, limits(overrides));
}

afterEach(() => {
    setSystemTime();
});

describe("execution clock", () => {
    test("starts with the whole budget and spends what is charged", async () => {
        const budget = budgetWith({ maxExecutionSeconds: 100 });
        expect(budget.remainingExecution()).toBe(100);
        await budget.chargeExecution(["work"], 30);
        expect(budget.remainingExecution()).toBe(70);
    });

    test("assertRemaining throws once the execution budget is spent", async () => {
        const budget = budgetWith({ maxExecutionSeconds: 10 });
        await budget.chargeExecution(["work"], 10);
        await expect(budget.assertRemaining()).rejects.toBeInstanceOf(
            DurationLimitExceededError,
        );
        await expect(budget.assertRemaining()).rejects.toThrow(
            "maxExecutionSeconds",
        );
    });
});

describe("wall clock", () => {
    test("counts down as real time passes", async () => {
        setSystemTime(new Date("2026-01-01T00:00:00Z"));
        const budget = budgetWith({ maxDurationSeconds: 60 });
        expect(await budget.remainingDuration()).toBe(60);

        setSystemTime(new Date("2026-01-01T00:00:45Z"));
        expect(await budget.remainingDuration()).toBe(15);
    });

    test("assertRemaining throws once the wall clock is spent", async () => {
        setSystemTime(new Date("2026-01-01T00:00:00Z"));
        const budget = budgetWith({ maxDurationSeconds: 60 });
        await budget.assertRemaining();

        setSystemTime(new Date("2026-01-01T00:01:30Z"));
        await expect(budget.assertRemaining()).rejects.toThrow(
            "maxDurationSeconds",
        );
    });

    test("the execution clock is reported before the wall clock", async () => {
        // Both are spent; the more specific overrun is the more useful one to
        // name, and it is the cheaper check besides.
        setSystemTime(new Date("2026-01-01T00:00:00Z"));
        const budget = budgetWith({
            maxDurationSeconds: 60,
            maxExecutionSeconds: 10,
        });
        // Anchors the start at t=0. Without this the anchor is recorded lazily
        // at the first check below, so the wall clock would not in fact be
        // spent and the test would pass whichever order the checks run in.
        await budget.assertRemaining();

        await budget.chargeExecution(["work"], 10);
        setSystemTime(new Date("2026-01-01T00:05:00Z"));
        expect(await budget.remainingDuration()).toBeLessThan(0);
        await expect(budget.assertRemaining()).rejects.toThrow(
            "maxExecutionSeconds",
        );
    });
});

describe("wall clock across a resume", () => {
    test("a resumed run inherits the original start rather than a fresh budget", async () => {
        // Time the host spent down still counts against the run. Re-anchoring
        // on resume would let a crash-looping run extend itself forever.
        const store = testingOnly_createInMemoryCheckpointStore();
        setSystemTime(new Date("2026-01-01T00:00:00Z"));
        const first = resumableBudget(store, { maxDurationSeconds: 600 });
        expect(await first.remainingDuration()).toBe(600);

        setSystemTime(new Date("2026-01-01T00:08:00Z"));
        const resumed = resumableBudget(store, { maxDurationSeconds: 600 });
        expect(await resumed.remainingDuration()).toBe(120);
    });

    test("a resumed run recharges what the original attempt spent", async () => {
        // Each charge is recorded under its step, so replaying the step
        // recharges the original measurement rather than the ~0 the replay
        // itself takes. Without this the execution clock restarts at zero on
        // every resume and never binds.
        const store = testingOnly_createInMemoryCheckpointStore();
        const first = resumableBudget(store, { maxExecutionSeconds: 100 });
        await first.chargeExecution(["slowStep"], 80);
        expect(first.remainingExecution()).toBe(20);

        const resumed = resumableBudget(store, { maxExecutionSeconds: 100 });
        await resumed.chargeExecution(["slowStep"], 0);
        expect(resumed.remainingExecution()).toBe(20);
    });

    test("a step that has not run before charges its live measurement", async () => {
        const store = testingOnly_createInMemoryCheckpointStore();
        const budget = resumableBudget(store, { maxExecutionSeconds: 100 });
        await budget.chargeExecution(["firstStep"], 10);
        await budget.chargeExecution(["secondStep"], 25);
        expect(budget.remainingExecution()).toBe(65);
    });

    test("the start anchor is recorded once, not per call", async () => {
        const store = testingOnly_createInMemoryCheckpointStore();
        setSystemTime(new Date("2026-01-01T00:00:00Z"));
        const budget = resumableBudget(store, { maxDurationSeconds: 600 });
        await budget.remainingDuration();

        setSystemTime(new Date("2026-01-01T00:01:00Z"));
        expect(await budget.remainingDuration()).toBe(540);
    });
});

describe("charging a failed step", () => {
    test("is not recorded, so a retry is charged its own cost", async () => {
        // A failed step's result is never checkpointed, so a resumed run
        // re-executes it. Recording the first attempt's cost would make every
        // later attempt replay that number instead of its own, and a run
        // crash-looping on one expensive step could never exhaust the budget.
        const store = testingOnly_createInMemoryCheckpointStore();
        const first = resumableBudget(store, { maxExecutionSeconds: 500 });
        first.chargeUnrecordedExecution(100);
        expect(first.remainingExecution()).toBe(400);

        const resumed = resumableBudget(store, { maxExecutionSeconds: 500 });
        await resumed.chargeExecution(["slowStep"], 100);
        expect(resumed.remainingExecution()).toBe(400);
    });
});

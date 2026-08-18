import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { testPolicies } from "../test-support";
import { createCheckpointingExecutionEngine } from "./checkpointing";
import { testingOnly_createInMemoryCheckpointStore } from "./checkpointing/in-memory-store";
import type { CheckpointStore } from "./checkpointing/types";
import { createExecutionContext } from "./context";
import { DurationLimitExceededError } from "./errors";
import { createInMemoryExecutionEngine } from "./in-memory";

/** Moves the clock as if the work took `seconds`, without waiting. */
function spend(seconds: number) {
    setSystemTime(new Date(Date.now() + seconds * 1000));
}

function contextOver(
    store: CheckpointStore,
    overrides: Record<string, number>,
) {
    return createExecutionContext(
        createCheckpointingExecutionEngine(store).createRun("r"),
        testPolicies(overrides),
    );
}

afterEach(() => {
    setSystemTime();
});

describe("charging across a resume", () => {
    test("a failed step's charge is recorded and counts against the resumed run's budget", async () => {
        // The failed attempt's result is not checkpointed, so the resumed run
        // re-executes the step — but the time the first attempt spent is still
        // recorded and replayed, so the resumed run cannot ignore that the step
        // already consumed real execution time.
        //
        // Note: the retry's own elapsed time is not additionally charged on top
        // of the failure — the `elapsedSeconds` key replays the failure's cost
        // rather than adding the retry's cost. The failure's recorded charge is
        // therefore an approximation; a future improvement could accumulate
        // charges across attempts under distinct keys.
        setSystemTime(new Date("2026-01-01T00:00:00Z"));
        const store = testingOnly_createInMemoryCheckpointStore();
        const budgetSeconds = { maxExecutionSeconds: 70 };

        const first = contextOver(store, budgetSeconds);
        await expect(
            first.step(["work"], async () => {
                spend(60);
                throw new Error("host went away");
            }),
        ).rejects.toThrow("host went away");

        // Clock reset: the resumed run starts "fresh" in wall time but must
        // still account for the 60s the failed attempt spent.
        setSystemTime(new Date("2026-01-01T00:00:00Z"));
        const resumed = contextOver(store, budgetSeconds);
        await resumed.step(["work"], async () => {
            spend(5);
            return "ok";
        });

        // 60s replayed from the failure's recorded charge, leaving only 10s.
        // Running a step that costs more than that overdraws the budget; the
        // next assertWithinBudget should then throw.
        await resumed.step(["extra"], async () => {
            spend(11);
            return "x";
        });
        await expect(resumed.assertWithinDurationBudget()).rejects.toThrow(
            "maxExecutionSeconds",
        );
    });

    test("a replayed successful step recharges its recorded cost", async () => {
        setSystemTime(new Date("2026-01-01T00:00:00Z"));
        const store = testingOnly_createInMemoryCheckpointStore();
        const budgetSeconds = { maxExecutionSeconds: 50 };

        const first = contextOver(store, budgetSeconds);
        await first.step(["work"], async () => {
            spend(40);
            return "ok";
        });

        setSystemTime(new Date("2026-01-01T00:00:00Z"));
        const resumed = contextOver(store, budgetSeconds);
        // Replays instantly, so its live measurement is ~0; the recorded 40 is
        // what must be charged.
        await resumed.step(["work"], async () => "ok");
        await resumed.step(["more"], async () => {
            spend(20);
            return "ok";
        });

        // 40 replayed plus 20 fresh overdraws the 50s budget. Without the
        // recorded charge the resumed run would believe it had spent only 20.
        await expect(
            resumed.assertWithinDurationBudget(),
        ).rejects.toBeInstanceOf(DurationLimitExceededError);
    });
});

describe("shouldRetry threading", () => {
    test("policy-level shouldRetry is applied to every step", async () => {
        const run = createInMemoryExecutionEngine().createRun("r");
        const ctx = createExecutionContext(run, {
            duration: testPolicies().duration,
            retry: {
                maxAttempts: 5,
                retryDelaySeconds: 0,
                shouldRetry: (message) => message !== "fatal",
            },
        });

        let attempts = 0;
        await expect(
            ctx.step(["s"], async () => {
                attempts++;
                throw new Error("fatal");
            }),
        ).rejects.toThrow("fatal");
        expect(attempts).toBe(1);
    });

    test("policy-level shouldRetry allows retrying retriable errors", async () => {
        const run = createInMemoryExecutionEngine().createRun("r");
        const ctx = createExecutionContext(run, {
            duration: testPolicies().duration,
            retry: {
                maxAttempts: 3,
                retryDelaySeconds: 0,
                shouldRetry: () => true,
            },
        });

        let attempts = 0;
        const output = await ctx.step(["s"], async () => {
            attempts++;
            if (attempts < 3) throw new Error("transient");
            return "ok";
        });
        expect(attempts).toBe(3);
        expect(output).toBe("ok");
    });

    test("per-call shouldRetry overrides the policy-level default", async () => {
        const run = createInMemoryExecutionEngine().createRun("r");
        const ctx = createExecutionContext(run, {
            duration: testPolicies().duration,
            retry: {
                maxAttempts: 5,
                retryDelaySeconds: 0,
                shouldRetry: () => true,
            },
        });

        let attempts = 0;
        await expect(
            ctx.step(
                ["s"],
                async () => {
                    attempts++;
                    throw new Error("boom");
                },
                { shouldRetry: () => false },
            ),
        ).rejects.toThrow("boom");
        expect(attempts).toBe(1);
    });
});

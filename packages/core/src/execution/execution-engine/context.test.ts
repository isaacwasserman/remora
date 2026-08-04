import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { testDurationPolicy } from "../test-support";
import { createCheckpointingExecutionEngine } from "./checkpointing";
import { testingOnly_createInMemoryCheckpointStore } from "./checkpointing/in-memory-store";
import type { CheckpointStore } from "./checkpointing/types";
import { createExecutionContext } from "./context";
import { DurationLimitExceededError } from "./errors";

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
        testDurationPolicy(overrides),
    );
}

afterEach(() => {
    setSystemTime();
});

describe("charging across a resume", () => {
    test("a retried step is charged what the retry spent, not what the failed attempt did", async () => {
        // A failed step's result is never checkpointed, so the resumed run
        // re-executes it. If the first attempt's cost had been recorded, the
        // retry would replay that number instead of its own and the clock would
        // be stuck at the first attempt's price.
        setSystemTime(new Date("2026-01-01T00:00:00Z"));
        const store = testingOnly_createInMemoryCheckpointStore();
        const budgetSeconds = { maxExecutionSeconds: 50 };

        const first = contextOver(store, budgetSeconds);
        await expect(
            first.step(["work"], async () => {
                spend(100);
                throw new Error("host went away");
            }),
        ).rejects.toThrow("host went away");

        setSystemTime(new Date("2026-01-01T00:00:00Z"));
        const resumed = contextOver(store, budgetSeconds);
        await resumed.step(["work"], async () => {
            spend(40);
            return "ok";
        });

        // 40 of 50 spent. Recharging the failed attempt's 100 would overdraw
        // the budget and make this throw.
        await resumed.assertWithinBudget();
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
        await expect(resumed.assertWithinBudget()).rejects.toBeInstanceOf(
            DurationLimitExceededError,
        );
    });
});

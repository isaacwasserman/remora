import { describe, expect, test } from "bun:test";
import { testPolicies } from "../test-support";
import { createCheckpointingExecutionEngine } from "./checkpointing";
import { testingOnly_createInMemoryCheckpointStore } from "./checkpointing/in-memory-store";
import type { CheckpointStore } from "./checkpointing/types";
import { createExecutionContext } from "./context";
import type { ExecutionRun } from "./types";

/** Drains a `waitFor` generator, returning its settled value. */
async function settle<TValue>(
    waiting: AsyncGenerator<unknown, TValue>,
): Promise<TValue> {
    let produced = await waiting.next();
    while (!produced.done) {
        produced = await waiting.next();
    }
    return produced.value;
}

/** A run whose `sleep` calls are counted rather than actually served. */
function countingRun(store: CheckpointStore) {
    const sleeps: number[] = [];
    const run = createCheckpointingExecutionEngine(store).createRun("r");
    const counting: ExecutionRun = {
        ...run,
        step: (name, fn, options) => run.step(name, fn, options),
        sleep: async (seconds) => {
            sleeps.push(seconds);
        },
    };
    return {
        context: createExecutionContext(counting, testPolicies()),
        sleeps,
    };
}

describe("waitFor", () => {
    test("polls until truthy, sleeping between attempts", async () => {
        const { context, sleeps } = countingRun(
            testingOnly_createInMemoryCheckpointStore(),
        );
        const seen: number[] = [];
        const result = await settle(
            context.waitFor(
                ["w"],
                async (attempt) => {
                    seen.push(attempt);
                    return attempt === 2 ? `done-${attempt}` : undefined;
                },
                { pollIntervalSeconds: 3 },
            ),
        );
        expect(result).toBe("done-2");
        expect(seen).toEqual([0, 1, 2]);
        expect(sleeps).toHaveLength(2);
        expect(sleeps.every((seconds) => seconds > 0 && seconds <= 3)).toBe(
            true,
        );
    });

    test("forwards what an attempt yields, and yields nothing on replay", async () => {
        // `poll` is a generator so progress from inside an attempt can escape the
        // `adapter.step` boundary, which hands back a promise rather than a stream.
        const store = testingOnly_createInMemoryCheckpointStore();
        const first = countingRun(store);
        const forwarded: string[] = [];
        const waiting = first.context.waitFor(
            ["w"],
            async function* (attempt) {
                yield `attempt-${attempt}-start`;
                yield `attempt-${attempt}-end`;
                return attempt === 1 ? "ready" : undefined;
            },
            { pollIntervalSeconds: 0.01 },
        );
        let produced = await waiting.next();
        while (!produced.done) {
            forwarded.push(produced.value as string);
            produced = await waiting.next();
        }
        expect(produced.value).toBe("ready");
        expect(forwarded).toEqual([
            "attempt-0-start",
            "attempt-0-end",
            "attempt-1-start",
            "attempt-1-end",
        ]);

        // Replaying returns the recorded results without re-running `poll`, so
        // there is nothing to forward the second time.
        const resumed = countingRun(store);
        const replayed: string[] = [];
        const again = resumed.context.waitFor(
            ["w"],
            async function* (): AsyncGenerator<string, string | undefined> {
                yield "should-not-run";
                return undefined;
            },
            { pollIntervalSeconds: 0.01 },
        );
        let replayProduced = await again.next();
        while (!replayProduced.done) {
            replayed.push(replayProduced.value as string);
            replayProduced = await again.next();
        }
        expect(replayProduced.value).toBe("ready");
        expect(replayed).toEqual([]);
    });

    test("a resumed wait serves only the time still remaining", async () => {
        // The wake-up deadline is checkpointed when the sleep starts, so a
        // resumed run does not re-serve the whole elapsed poll history before
        // reaching the first live attempt.
        const store = testingOnly_createInMemoryCheckpointStore();
        const intervalSeconds = 0.05;

        const first = countingRun(store);
        await expect(
            settle(
                first.context.waitFor(
                    ["w"],
                    async (attempt) => {
                        if (attempt === 3) throw new Error("host went away");
                        return undefined;
                    },
                    { pollIntervalSeconds: intervalSeconds },
                ),
            ),
        ).rejects.toThrow("host went away");
        expect(first.sleeps).toHaveLength(3);

        // Let every recorded deadline fall into the past.
        await new Promise((resolve) => setTimeout(resolve, 250));

        const resumed = countingRun(store);
        const attempted: number[] = [];
        const result = await settle(
            resumed.context.waitFor(
                ["w"],
                async (attempt) => {
                    attempted.push(attempt);
                    return "answered";
                },
                { pollIntervalSeconds: intervalSeconds },
            ),
        );
        expect(result).toBe("answered");
        // Attempts 0-2 replay from their checkpoints, and none of their elapsed
        // deadlines is waited out a second time.
        expect(attempted).toEqual([3]);
        // Each replayed delay is still issued — a durable engine keys operations
        // by position — but owes no time.
        expect(resumed.sleeps).toEqual([0, 0, 0]);
    });

    test("a delay interrupted mid-flight waits out only its remainder", async () => {
        // The deadline is recorded before sleeping, so an interrupted delay is
        // resumed rather than restarted from zero.
        const store = testingOnly_createInMemoryCheckpointStore();
        const first = countingRun(store);
        await expect(
            settle(
                first.context.waitFor(
                    ["w"],
                    async (attempt) => {
                        if (attempt === 1) throw new Error("died mid-delay");
                        return undefined;
                    },
                    { pollIntervalSeconds: 10 },
                ),
            ),
        ).rejects.toThrow("died mid-delay");

        // Real time passes while the host is down, eating into the deadline.
        await new Promise((resolve) => setTimeout(resolve, 100));

        const resumed = countingRun(store);
        await settle(
            resumed.context.waitFor(
                ["w"],
                async (attempt) => (attempt === 1 ? "ok" : undefined),
                { pollIntervalSeconds: 10 },
            ),
        );
        // Still owed time, so it waits — but strictly less than the full
        // interval, because the deadline was set on the first run.
        // The 100ms downtime must be deducted; a recomputed deadline would sleep
        // the full interval (or a hair under it), so leave no room for that.
        expect(resumed.sleeps).toHaveLength(1);
        expect(resumed.sleeps[0]).toBeGreaterThan(0);
        expect(resumed.sleeps[0]).toBeLessThanOrEqual(9.9);
    });
});

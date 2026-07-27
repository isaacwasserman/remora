import { describe, expect, test } from "bun:test";
import { createInMemoryExecutionEngine } from ".";

describe("in-memory execution engine", () => {
    test("a step executes every time it is reached", async () => {
        const run = createInMemoryExecutionEngine().createRun("p", "r");
        let calls = 0;
        const first = await run.step("s", async () => ++calls);
        const second = await run.step("s", async () => ++calls);
        expect([first, second]).toEqual([1, 2]);
    });

    test("re-invoking a run under the same ids re-executes rather than replaying", async () => {
        const engine = createInMemoryExecutionEngine();
        let calls = 0;
        await engine.createRun("p", "r").step("s", async () => ++calls);
        await engine.createRun("p", "r").step("s", async () => ++calls);
        expect(calls).toBe(2);
    });

    test("checkpointing: true records results so a resumed run replays them", async () => {
        const engine = createInMemoryExecutionEngine({ checkpointing: true });
        let calls = 0;
        await engine.createRun("p", "r").step("s", async () => ++calls);
        await engine.createRun("p", "r").step("s", async () => ++calls);
        expect(calls).toBe(1);
    });

    test("a nondeterministic value produced in its own step is not stable across retries", async () => {
        // The mirror image of the durable engine's stability guarantee: without
        // checkpointing, an id minted inside a step is minted afresh on every
        // attempt.
        const run = createInMemoryExecutionEngine().createRun("p", "r");
        const seen: string[] = [];
        let attempts = 0;
        await run.step(
            "outer",
            async () => {
                seen.push(
                    await run.step("outer/id", async () => crypto.randomUUID()),
                );
                attempts++;
                if (attempts < 2) {
                    throw new Error("retry");
                }
            },
            { maxAttempts: 2, retryDelaySeconds: 0 },
        );
        expect(seen).toHaveLength(2);
        expect(seen[0]).not.toBe(seen[1]);
    });
});

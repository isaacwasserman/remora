import { describe, expect, test } from "bun:test";
import { createDurableExecutionEngine } from "./durable-execution";
import { createInMemoryCheckpointAdapter } from "./durable-execution/in-memory-adapter";
import { createInMemoryExecutionEngine } from "./in-memory";
import type { ExecutionEngine } from "./types";

// `StepOptions` are applied by `runStep`, which every engine shares, so a step's
// retry and timeout behavior must not depend on which engine is running it.

const ENGINES: Array<{ name: string; create: () => ExecutionEngine }> = [
    { name: "in-memory", create: createInMemoryExecutionEngine },
    {
        name: "durable",
        create: () =>
            createDurableExecutionEngine(createInMemoryCheckpointAdapter()),
    },
];

for (const engine of ENGINES) {
    describe(`step policy [${engine.name}]`, () => {
        test("no retry option means a single attempt", async () => {
            const run = engine.create().createRun("p", "r");
            let attempts = 0;
            await expect(
                run.step("s", async () => {
                    attempts++;
                    throw new Error("boom");
                }),
            ).rejects.toThrow("boom");
            expect(attempts).toBe(1);
        });

        test("step retries up to maxAttempts then succeeds", async () => {
            const run = engine.create().createRun("p", "r");
            let attempts = 0;
            const output = await run.step(
                "s",
                async () => {
                    attempts++;
                    if (attempts < 3) {
                        throw new Error("boom");
                    }
                    return "ok";
                },
                { maxAttempts: 3, retryDelaySeconds: 0 },
            );
            expect(attempts).toBe(3);
            expect(output).toBe("ok");
        });

        test("step throws after exhausting its attempts", async () => {
            const run = engine.create().createRun("p", "r");
            let attempts = 0;
            await expect(
                run.step(
                    "s",
                    async () => {
                        attempts++;
                        throw new Error("nope");
                    },
                    { maxAttempts: 2, retryDelaySeconds: 0 },
                ),
            ).rejects.toThrow("nope");
            expect(attempts).toBe(2);
        });

        test("shouldRetry returning false stops retrying immediately", async () => {
            const run = engine.create().createRun("p", "r");
            let attempts = 0;
            await expect(
                run.step(
                    "s",
                    async () => {
                        attempts++;
                        throw new Error("fatal");
                    },
                    {
                        maxAttempts: 5,
                        retryDelaySeconds: 0,
                        shouldRetry: () => false,
                    },
                ),
            ).rejects.toThrow("fatal");
            expect(attempts).toBe(1);
        });

        test("timeoutSeconds fails a slow attempt", async () => {
            const run = engine.create().createRun("p", "r");
            await expect(
                run.step(
                    "s",
                    () =>
                        new Promise((resolve) =>
                            setTimeout(() => resolve("late"), 30),
                        ),
                    { timeoutSeconds: 0.005 },
                ),
            ).rejects.toThrow(/timed out/);
        });
    });
}

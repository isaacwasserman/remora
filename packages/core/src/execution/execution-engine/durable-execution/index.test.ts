import { describe, expect, test } from "bun:test";
import { createDurableExecutionEngine } from ".";
import { createInMemoryCheckpointAdapter } from "./in-memory-adapter";

/**
 * Driven through the in-memory checkpoint adapter, whose map lives as long as the
 * engine — so two `createRun` calls on the same engine share checkpoints and can
 * replay, standing in for a resumed run without needing a real backend.
 */
function engine() {
    return createDurableExecutionEngine(createInMemoryCheckpointAdapter());
}

describe("durable execution engine", () => {
    test("getExecutionInfo returns the provided keys", () => {
        const run = engine().createRun("proc", "run-1");
        expect(run.getExecutionInfo()).toEqual({
            procedureId: "proc",
            runId: "run-1",
        });
    });

    test("an omitted runId is defaulted to a fresh id per run", () => {
        const shared = engine();
        const first = shared.createRun("proc").getExecutionInfo().runId;
        const second = shared.createRun("proc").getExecutionInfo().runId;
        expect(first).not.toBe("");
        expect(first).not.toBe(second);
    });

    test("step result is checkpointed and replayed on a resumed run", async () => {
        const shared = engine();
        let calls = 0;
        const first = await shared.createRun("p", "r").step("s", async () => {
            calls++;
            return calls;
        });
        // A new run bound to the same engine (adapter) + runId replays.
        const second = await shared.createRun("p", "r").step("s", async () => {
            calls++;
            return calls;
        });
        expect(calls).toBe(1);
        expect(first).toBe(second);
    });

    test("steps with distinct names get distinct checkpoints", async () => {
        const shared = engine();
        const run = shared.createRun("p", "r");
        expect(await run.step("s1", async () => "a")).toBe("a");
        expect(await run.step("s2", async () => "b")).toBe("b");
        // Replaying both on a resumed run proves each name got its own
        // checkpoint rather than one overwriting the other.
        const resumed = shared.createRun("p", "r");
        const throwing = async (): Promise<string> => {
            throw new Error("should have replayed");
        };
        expect(await resumed.step("s1", throwing)).toBe("a");
        expect(await resumed.step("s2", throwing)).toBe("b");
    });

    test("a reused step name replays the first call's checkpoint", async () => {
        // Keys come from the caller's name alone, never from execution order, so
        // callers must supply names that are unique among siblings — the executor
        // guarantees this by deriving them from a `StepPath`. Reuse replaying is
        // the same mechanism a step's retry attempts rely on.
        const run = engine().createRun("p", "r");
        const first = await run.step("s", async () => "a");
        const second = await run.step("s", async () => "b");
        expect([first, second]).toEqual(["a", "a"]);
    });

    test("a nondeterministic value is stable across retries when produced in its own step", async () => {
        // The engine has no `now()`/`uuid()`: callers make such values stable by
        // generating them inside a `step`, whose recorded result then replays like
        // any other — including across an enclosing step's retries.
        const run = engine().createRun("p", "r");
        const seen: string[] = [];
        let attempts = 0;
        const output = await run.step(
            "outer",
            async () => {
                const id = await run.step("outer/id", async () =>
                    crypto.randomUUID(),
                );
                seen.push(id);
                attempts++;
                if (attempts < 2) {
                    throw new Error("retry");
                }
                return id;
            },
            { maxAttempts: 2, retryDelaySeconds: 0 },
        );
        // Both attempts saw the same recorded id.
        expect(seen).toEqual([output, output]);
    });
});

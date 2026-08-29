import { delaySeconds, runStep } from "../run-step";
import type { ExecutionEngine, ExecutionRun } from "../types";
import type { CheckpointStore } from "./types";

/**
 * Binds a {@link CheckpointStore} to a single run, producing an
 * {@link ExecutionRun} that records each step's result in the store. A step
 * whose result is already recorded returns it without re-executing.
 *
 * A step's key is exactly the name the caller supplied, so callers must supply
 * names that are unique within the run — reusing one replays the first call's
 * recorded result.
 */
function createRun(store: CheckpointStore, runId: string): ExecutionRun {
    return {
        getExecutionInfo() {
            return { runId };
        },

        async step(stepName, fn, stepOptions) {
            const resultKey = `${stepName}:result`;

            const recorded = await store.load(runId, resultKey);
            if (recorded !== undefined) {
                return recorded.value as Awaited<ReturnType<typeof fn>>;
            }

            const result = await runStep(fn, stepOptions);
            await store.save(runId, resultKey, result);
            return result;
        },

        sleep(seconds) {
            return delaySeconds(seconds);
        },
    };
}

/**
 * Creates an {@link ExecutionEngine} that records every step's result in
 * `store`, so a run re-invoked with the same `runId` skips the
 * steps that already completed.
 *
 * This is checkpointing, not durable execution: nothing here detects a crashed
 * run or restarts one, and a sleep is served by holding the process open. The
 * engine only guarantees that *if* a run is invoked again under the same ids,
 * completed steps are not repeated. A host that can suspend and resume a run
 * itself belongs behind `createDurableExecutionEngine` instead.
 */
export function createCheckpointingExecutionEngine(
    store: CheckpointStore,
): ExecutionEngine {
    return {
        createRun(runId = crypto.randomUUID()) {
            return createRun(store, runId);
        },
    };
}

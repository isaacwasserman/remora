import type { CheckpointStore } from "./types";

/**
 * A {@link CheckpointStore} backed by a `Map` per run. Nothing survives the
 * process, so it is **not** durable — it exists to give
 * `createInMemoryExecutionEngine` a checkpointing mode, and to let tests assert
 * replay behavior without a real backend.
 */
export function testingOnly_createInMemoryCheckpointStore(): CheckpointStore {
    const runs = new Map<string, Map<string, unknown>>();

    return {
        async load(runId, key) {
            const entries = runs.get(runId);
            return entries?.has(key) ? { value: entries.get(key) } : undefined;
        },
        async save(runId, key, value) {
            let entries = runs.get(runId);
            if (entries === undefined) {
                entries = new Map<string, unknown>();
                runs.set(runId, entries);
            }
            entries.set(key, value);
        },
    };
}

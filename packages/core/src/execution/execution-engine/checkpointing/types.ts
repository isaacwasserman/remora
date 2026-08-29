/**
 * Key-value persistence backend for
 * {@link createCheckpointingExecutionEngine}. Records the result of each step
 * (keyed by run id + step key) so a re-invoked run replays it instead of
 * executing the step again.
 *
 * This is *not* durable execution: a store can only answer "what did this step
 * return", never suspend a run or resume one after a crash — recovery stays the
 * host's job. A platform that owns its own journal and suspend/resume implements
 * `DurableExecutionAdapter` instead.
 *
 * This package ships no persistent implementation. Recorded values must survive
 * whatever round-trip the backend performs; a backend that serializes to JSON
 * will degrade `Date`, `Map`, and friends into plain data on replay.
 */
export interface CheckpointStore {
    /**
     * Returns the value previously recorded under `key` for `runId`, wrapped in
     * `{ value }`, or `undefined` if nothing has been recorded yet. The wrapper
     * distinguishes a recorded `undefined` from an absent entry.
     */
    load(runId: string, key: string): Promise<{ value: unknown } | undefined>;
    /** Records `value` under `key` for `runId`, overwriting any prior value. */
    save(runId: string, key: string, value: unknown): Promise<void>;
}

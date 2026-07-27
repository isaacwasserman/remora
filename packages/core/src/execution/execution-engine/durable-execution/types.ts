/**
 * Persistence backend for {@link createDurableExecutionEngine}. Records the
 * result of each step (keyed by run id + step key) so a re-invoked run replays it
 * instead of executing the step again.
 *
 * This package ships no durable implementation — durability is entirely the
 * caller's. Recorded values must survive whatever round-trip the backend
 * performs; a backend that serializes to JSON will degrade `Date`, `Map`, and
 * friends into plain data on replay.
 */
export interface DurableExecutionAdapter {
    /**
     * Returns the value previously recorded under `key` for `runId`, wrapped in
     * `{ value }`, or `undefined` if nothing has been recorded yet. The wrapper
     * distinguishes a recorded `undefined` from an absent entry.
     */
    load(runId: string, key: string): Promise<{ value: unknown } | undefined>;
    /** Records `value` under `key` for `runId`, overwriting any prior value. */
    save(runId: string, key: string, value: unknown): Promise<void>;
}

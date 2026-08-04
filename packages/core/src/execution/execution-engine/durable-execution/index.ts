import type { ExecutionEngine } from "../types";
import type { DurableExecutionAdapter } from "./types";

export type { DurableExecutionAdapter } from "./types";

/**
 * Wraps a {@link DurableExecutionAdapter} — already bound to the invocation the
 * host is running — as an {@link ExecutionEngine}, so the workflow executor can
 * consume it like any other engine.
 *
 * `createRun` reports the host's ids and ignores the ones it is passed: a
 * durable host assigns the run, and a caller-minted id would name a run the host
 * has never heard of.
 *
 * The adapter's journal is keyed by operation order, so the workflow must issue
 * the same sequence of `step` and `sleep` calls on every invocation. Values that
 * would otherwise vary — clocks, random ids — must be produced inside a `step`,
 * which the executor already does.
 */
export function createDurableExecutionEngine(
    adapter: DurableExecutionAdapter,
): ExecutionEngine {
    return {
        createRun() {
            return adapter;
        },
    };
}

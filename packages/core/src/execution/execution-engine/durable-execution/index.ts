import { delaySeconds, runStep } from "../run-step";
import type { ExecutionEngine, ExecutionRun } from "../types";
import type { DurableExecutionAdapter } from "./types";

/**
 * Binds a {@link DurableExecutionAdapter} to a single run, producing an
 * {@link ExecutionRun} that records each step's result through the adapter. A
 * step whose result is already recorded returns it without re-executing.
 *
 * A step's key is exactly the name the caller supplied, so callers must supply
 * names that are unique within the run — reusing one replays the first call's
 * recorded result.
 */
function createRun(
    adapter: DurableExecutionAdapter,
    procedureId: string,
    runId: string,
): ExecutionRun {
    return {
        getExecutionInfo() {
            return { procedureId, runId };
        },

        async step(stepName, fn, stepOptions) {
            const resultKey = `${stepName}:result`;

            const recorded = await adapter.load(runId, resultKey);
            if (recorded !== undefined) {
                return recorded.value as Awaited<ReturnType<typeof fn>>;
            }

            const result = await runStep(fn, stepOptions);
            await adapter.save(runId, resultKey, result);
            return result;
        },

        sleep(seconds) {
            return delaySeconds(seconds);
        },
    };
}

/**
 * Creates an {@link ExecutionEngine} that records every step's result through
 * `adapter`, so a run re-invoked with the same `procedureId` and `runId` skips
 * the steps that already completed.
 *
 * Recovery is the host's job: nothing here detects a crashed run or restarts
 * one. The engine only guarantees that *if* a run is invoked again under the
 * same ids, completed steps are not repeated. Durability beyond that is
 * entirely the adapter's.
 */
export function createDurableExecutionEngine(
    adapter: DurableExecutionAdapter,
): ExecutionEngine {
    return {
        createRun(procedureId, runId = crypto.randomUUID()) {
            return createRun(adapter, procedureId, runId);
        },
    };
}

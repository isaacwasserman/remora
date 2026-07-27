import { createDurableExecutionEngine } from "../durable-execution";
import { createInMemoryCheckpointAdapter } from "../durable-execution/in-memory-adapter";
import { delaySeconds, runStep } from "../run-step";
import type { ExecutionEngine } from "../types";

export type InMemoryExecutionEngineOptions = {
    /**
     * Records each step's result in a process-local map, so re-invoking a run
     * under the same `procedureId` and `runId` replays completed steps instead
     * of executing them again. Off by default: the checkpoints buy nothing
     * within a single run and never outlive the process, so they are only useful
     * to tests that need to exercise replay.
     * @see {@link createInMemoryCheckpointAdapter}
     */
    checkpointing?: boolean;
};

/**
 * Creates the default {@link ExecutionEngine}: steps run in this process and
 * nothing is recorded anywhere. A step executes every time it is reached
 * (subject to its own `StepOptions` retry policy), and a crashed or re-invoked
 * run starts over from the beginning.
 *
 * Pass a `createDurableExecutionEngine` engine instead when a run needs to
 * survive its process.
 */
export function createInMemoryExecutionEngine(
    options?: InMemoryExecutionEngineOptions,
): ExecutionEngine {
    if (options?.checkpointing) {
        return createDurableExecutionEngine(createInMemoryCheckpointAdapter());
    }

    return {
        createRun(procedureId, runId = crypto.randomUUID()) {
            return {
                getExecutionInfo() {
                    return { procedureId, runId };
                },
                step(_stepName, fn, stepOptions) {
                    return runStep(fn, stepOptions);
                },
                sleep(seconds) {
                    return delaySeconds(seconds);
                },
            };
        },
    };
}

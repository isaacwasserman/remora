import { createAsyncQueue } from "./async-queue";
import type {
    ExecutionContext,
    ExecutionRun,
    StepPath,
    WaitForOptions,
} from "./types";

/**
 * Separator for {@link StepPath} segments. Step ids cannot contain it (see the
 * id pattern in `schema.ts`) and the executor's other segments are digits or
 * fixed literals, so a joined path is an unambiguous encoding of its segments.
 */
const STEP_PATH_SEPARATOR = ".";

export function joinStepPath(stepPath: StepPath): string {
    return stepPath.join(STEP_PATH_SEPARATOR);
}

function isAsyncGenerator<TUpdate, TValue>(
    polled: Promise<TValue> | AsyncGenerator<TUpdate, TValue>,
): polled is AsyncGenerator<TUpdate, TValue> {
    return Symbol.asyncIterator in polled;
}

export function createExecutionContext(run: ExecutionRun): ExecutionContext {
    const { procedureId, runId } = run.getExecutionInfo();

    /**
     * The deadline is produced inside a `step` so a checkpointing engine
     * replays it; the comparison against it must read the real clock, not the
     * recorded one.
     */
    const sleepStep = async (
        stepPath: StepPath,
        seconds: number,
    ): Promise<void> => {
        const wakeAtMs = await run.step(
            joinStepPath([...stepPath, "wake-at"]),
            async () => Date.now() + seconds * 1000,
        );
        const remainingMs = wakeAtMs - Date.now();
        if (remainingMs > 0) {
            await run.sleep(remainingMs / 1000);
        }
    };

    return {
        ...run,
        procedureId,
        runId,
        step: (stepPath, stepFn, options) =>
            run.step(joinStepPath(stepPath), stepFn, options),
        sleep: sleepStep,
        waitFor: async function* <TValue, TUpdate = never>(
            stepPath: StepPath,
            poll: (
                attempt: number,
            ) => Promise<TValue> | AsyncGenerator<TUpdate, TValue>,
            options?: WaitForOptions,
        ): AsyncGenerator<TUpdate, NonNullable<TValue>> {
            const backoffMultiplier = options?.backoffMultiplier ?? 1;
            const maxAttempts = options?.maxAttempts;
            // Produced inside a `step`, so on a checkpointing engine the budget
            // covers time the host spent down rather than restarting from zero
            // on every resume.
            const deadline =
                options?.maxWaitSeconds !== undefined
                    ? await run.step(
                          joinStepPath([...stepPath, "deadline"]),
                          async () =>
                              Date.now() +
                              (options.maxWaitSeconds as number) * 1000,
                      )
                    : undefined;

            let interval = options?.pollIntervalSeconds ?? 1;
            let attempt = 0;
            while (true) {
                // Each attempt goes through `run.step`, which hands back a
                // promise rather than a stream, so a generator poll's updates
                // are buffered past that boundary and re-yielded here.
                const updates = createAsyncQueue<TUpdate>();
                const settled = run
                    .step(
                        joinStepPath([...stepPath, "attempt", String(attempt)]),
                        async () => {
                            const polled = poll(attempt);
                            if (!isAsyncGenerator(polled)) {
                                return await polled;
                            }
                            let produced = await polled.next();
                            while (!produced.done) {
                                updates.push(produced.value);
                                produced = await polled.next();
                            }
                            return produced.value;
                        },
                    )
                    // Mapped to a value before `finally` so a rejection is never
                    // unhandled while updates are still being forwarded.
                    .then(
                        (value) => ({ value, failure: undefined }),
                        (failure: unknown) => ({ value: undefined, failure }),
                    )
                    .finally(() => updates.close());

                for await (const update of updates) {
                    yield update;
                }

                const { value, failure } = await settled;
                if (failure !== undefined) {
                    throw failure;
                }
                if (value) {
                    // Truthy implies non-nullish; TS does not narrow an
                    // unconstrained generic that far.
                    return value as NonNullable<TValue>;
                }
                attempt++;

                if (maxAttempts !== undefined && attempt >= maxAttempts) {
                    throw new Error(
                        `waitFor condition not met after ${maxAttempts} attempts`,
                    );
                }
                if (deadline !== undefined && Date.now() >= deadline) {
                    throw new Error(
                        `waitFor condition not met within ${options?.maxWaitSeconds}s`,
                    );
                }

                await sleepStep(
                    [...stepPath, "attempt", String(attempt)],
                    interval,
                );
                interval *= backoffMultiplier;
            }
        },
    };
}

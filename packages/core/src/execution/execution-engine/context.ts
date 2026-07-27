import {
    clampSeconds,
    type DurationPolicy,
    floorSeconds,
    resolveDurationLimits,
} from "../../duration-policy";
import { createAsyncQueue } from "./async-queue";
import { createDurationBudget } from "./duration-budget";
import { joinStepPath, reservedStepPath } from "./step-path";
import type {
    ExecutionContext,
    ExecutionRun,
    StepOptions,
    StepPath,
    WaitForOptions,
} from "./types";

export { joinStepPath };

function isAsyncGenerator<TUpdate, TValue>(
    polled: Promise<TValue> | AsyncGenerator<TUpdate, TValue>,
): polled is AsyncGenerator<TUpdate, TValue> {
    return Symbol.asyncIterator in polled;
}

/**
 * The layer that enforces the duration policy. It is the narrowest waist that
 * sees every timed operation and the only one that structurally separates wait
 * time (`run.sleep`) from execution time (`run.step`) — the
 * `maxDurationSeconds` / `maxExecutionSeconds` split. Step executors stay
 * policy-ignorant: they evaluate their authored durations and call in here.
 */
export function createExecutionContext(
    run: ExecutionRun,
    policy: DurationPolicy,
): ExecutionContext {
    const { procedureId, runId } = run.getExecutionInfo();
    const limits = resolveDurationLimits(policy);
    const budget = createDurationBudget(run, limits);

    /**
     * Depth of nested `policedStep` calls. A `waitFor` attempt is a step whose
     * body runs more steps, and the outer measurement already contains the
     * inner ones, so only the outermost charges — otherwise every second inside
     * a poll is billed once per level.
     */
    let stepDepth = 0;

    /**
     * Runs one step under the policy: the budget gate is checked before
     * `run.step`, so it throws outside the retry loop and no retry can swallow
     * it, and the elapsed time is charged to the execution clock. A replayed
     * step measures ~0, but the charge is itself recorded, so replay recharges
     * what the original attempt spent.
     */
    const policedStep = async <TStepOutput>(
        stepPath: StepPath,
        stepFn: () => Promise<TStepOutput>,
        options?: StepOptions,
    ): Promise<TStepOutput> => {
        await budget.assertRemaining();
        const timeoutSeconds = Math.min(
            options?.timeoutSeconds ?? Number.POSITIVE_INFINITY,
            limits.maxStepExecutionSeconds,
            budget.remainingExecution(),
            await budget.remainingDuration(),
        );
        const isOutermost = stepDepth === 0;
        stepDepth++;
        const startedAtMs = Date.now();
        try {
            return await run.step(joinStepPath(stepPath), stepFn, {
                ...options,
                timeoutSeconds,
            });
        } finally {
            stepDepth--;
            if (isOutermost) {
                await budget.chargeExecution(
                    stepPath,
                    (Date.now() - startedAtMs) / 1000,
                );
            }
        }
    };

    /**
     * The deadline is produced inside a `step` so a checkpointing engine
     * replays it; the comparison against it must read the real clock, not the
     * recorded one. Bookkeeping like this goes through the raw `run.step`, so
     * it is neither charged as execution time nor subject to the per-step
     * timeout.
     */
    const sleepStep = async (
        stepPath: StepPath,
        seconds: number,
    ): Promise<void> => {
        await budget.assertRemaining();
        const wakeAtMs = await run.step(
            reservedStepPath(stepPath, "wakeAt"),
            async () =>
                Date.now() +
                clampSeconds(
                    seconds,
                    Math.min(
                        limits.maxSleepSeconds,
                        await budget.remainingDuration(),
                    ),
                ) *
                    1000,
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
        assertWithinBudget: budget.assertRemaining,
        step: policedStep,
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
            // Capped by the policy, and present even when the caller passes
            // none — an unbounded wait is not expressible.
            const maxWaitSeconds = clampSeconds(
                options?.maxWaitSeconds ?? Number.POSITIVE_INFINITY,
                Math.min(
                    limits.maxWaitSeconds,
                    await budget.remainingDuration(),
                ),
            );
            // Produced inside a `step`, so on a checkpointing engine the budget
            // covers time the host spent down rather than restarting from zero
            // on every resume.
            const deadline = await run.step(
                reservedStepPath(stepPath, "deadline"),
                async () => Date.now() + maxWaitSeconds * 1000,
            );

            let interval = floorSeconds(
                options?.pollIntervalSeconds ?? limits.minPollIntervalSeconds,
                limits.minPollIntervalSeconds,
            );
            let attempt = 0;
            while (true) {
                // Each attempt goes through `run.step`, which hands back a
                // promise rather than a stream, so a generator poll's updates
                // are buffered past that boundary and re-yielded here.
                const updates = createAsyncQueue<TUpdate>();
                const settled = policedStep(
                    [...stepPath, "attempt", String(attempt)],
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
                if (Date.now() >= deadline) {
                    throw new Error(
                        `waitFor condition not met within ${maxWaitSeconds}s`,
                    );
                }

                await sleepStep(
                    [...stepPath, "attempt", String(attempt)],
                    // Overshooting the deadline would sleep past a wait that is
                    // already lost.
                    Math.min(interval, (deadline - Date.now()) / 1000),
                );
                // Re-floored rather than multiplied in place: a multiplier
                // below 1 (or a NaN one, which an expression can produce)
                // would otherwise walk the interval under the policy floor and
                // busy-poll the condition.
                interval = floorSeconds(
                    interval * backoffMultiplier,
                    limits.minPollIntervalSeconds,
                );
            }
        },
    };
}

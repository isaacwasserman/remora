import type { DurationLimits } from "../../duration-policy";
import { DurationLimitExceededError } from "./errors";
import { reservedStepPath } from "./step-path";
import type { ExecutionRun, StepPath } from "./types";

/**
 * The two run-level clocks: wall time since the run started, which covers waits,
 * and execution time, which counts only step bodies that actually ran.
 */
export type DurationBudget = {
    /** Seconds of wall clock left before `maxDurationSeconds` is spent. */
    remainingDuration: () => Promise<number>;
    /** Seconds of step-body time left before `maxExecutionSeconds` is spent. */
    remainingExecution: () => number;
    /**
     * Charges a step's measured time to the execution clock, recording it under
     * the step so a resumed run recharges what the original attempt spent
     * instead of restarting the clock at zero.
     */
    chargeExecution: (stepPath: StepPath, seconds: number) => Promise<void>;
    /** Throws {@link DurationLimitExceededError} if either clock is spent. */
    assertRemaining: () => Promise<void>;
};

export function createDurationBudget(
    run: ExecutionRun,
    limits: DurationLimits,
): DurationBudget {
    let startedAtMs: Promise<number> | undefined;
    let chargedExecutionSeconds = 0;

    /**
     * Anchored through `run.step`, so a resumed run inherits the original start
     * rather than granting itself a fresh budget. Recorded lazily and memoized
     * to keep context construction synchronous.
     */
    const runStartedAtMs = () => {
        startedAtMs ??= run.step(reservedStepPath([], "startedAt"), async () =>
            Date.now(),
        );
        return startedAtMs;
    };

    const remainingDuration = async () =>
        limits.maxDurationSeconds -
        (Date.now() - (await runStartedAtMs())) / 1000;

    const remainingExecution = () =>
        limits.maxExecutionSeconds - chargedExecutionSeconds;

    return {
        remainingDuration,
        remainingExecution,
        chargeExecution: async (stepPath, seconds) => {
            chargedExecutionSeconds += await run.step(
                reservedStepPath(stepPath, "elapsedSeconds"),
                async () => seconds,
            );
        },
        assertRemaining: async () => {
            if (remainingExecution() <= 0) {
                throw new DurationLimitExceededError(
                    "maxExecutionSeconds",
                    limits.maxExecutionSeconds,
                );
            }
            if ((await remainingDuration()) <= 0) {
                throw new DurationLimitExceededError(
                    "maxDurationSeconds",
                    limits.maxDurationSeconds,
                );
            }
        },
    };
}

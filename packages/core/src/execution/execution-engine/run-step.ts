import { StepTimeoutError, UnrecoverableExecutionError } from "./errors";
import type { StepOptions } from "./types";

export function delaySeconds(seconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

/**
 * Longest delay `setTimeout` can represent. Beyond this the delay overflows a
 * 32-bit signed integer and the timer fires on the next tick instead, so a
 * step bounded past this point has to run untimed rather than be killed at
 * once.
 */
const MAX_TIMER_SECONDS = 2_147_483;

export async function runWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutSeconds: number | undefined,
): Promise<T> {
    if (timeoutSeconds === undefined || timeoutSeconds > MAX_TIMER_SECONDS) {
        return fn();
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
            () => reject(new StepTimeoutError(timeoutSeconds)),
            timeoutSeconds * 1000,
        );
    });
    try {
        return await Promise.race([fn(), timeout]);
    } finally {
        if (timer !== undefined) {
            clearTimeout(timer);
        }
    }
}

/**
 * A step's {@link StepOptions} reduced to the two decisions a retry loop makes,
 * so an engine that delegates retrying to its host derives them from the same
 * place {@link runStep} does.
 */
export type ResolvedRetryPolicy = {
    maxAttempts: number;
    /** Whether a failed attempt is worth repeating at all. */
    isRetriable: (error: unknown) => boolean;
    /** Delay before the attempt following `attempt`, which is 1-based. */
    delaySecondsAfter: (attempt: number) => number;
};

export function resolveRetryPolicy(
    options: StepOptions | undefined,
): ResolvedRetryPolicy {
    // Retries are opt-in: with no retry option set, a step runs once.
    const retriesEnabled =
        options !== undefined &&
        (options.maxAttempts !== undefined ||
            options.retryDelaySeconds !== undefined ||
            options.backoffCoefficient !== undefined ||
            options.shouldRetry !== undefined);

    const backoffCoefficient = options?.backoffCoefficient ?? 2;
    const maxDelay = options?.maxRetryDelaySeconds ?? Number.POSITIVE_INFINITY;
    const initialDelay = options?.retryDelaySeconds ?? 1;

    return {
        maxAttempts: retriesEnabled ? (options?.maxAttempts ?? 3) : 1,
        isRetriable: (error) => {
            // Retrying one of these cannot help, and would spend budget the run
            // has already been told it is out of.
            if (error instanceof UnrecoverableExecutionError) {
                return false;
            }
            if (options?.shouldRetry === undefined) {
                return true;
            }
            const message =
                error instanceof Error ? error.message : String(error);
            return options.shouldRetry(message);
        },
        delaySecondsAfter: (attempt) =>
            Math.min(
                initialDelay * backoffCoefficient ** (attempt - 1),
                maxDelay,
            ),
    };
}

/**
 * Applies a step's {@link StepOptions} retry and timeout policy to `fn`. Used by
 * engines that retry in-process; an engine whose host owns retrying passes
 * {@link resolveRetryPolicy} to the host instead.
 */
export async function runStep<T>(
    fn: () => Promise<T>,
    options: StepOptions | undefined,
): Promise<T> {
    const policy = resolveRetryPolicy(options);

    for (let attempt = 1; ; attempt++) {
        try {
            return await runWithTimeout(fn, options?.timeoutSeconds);
        } catch (error) {
            if (attempt >= policy.maxAttempts || !policy.isRetriable(error)) {
                throw error;
            }
            await delaySeconds(policy.delaySecondsAfter(attempt));
        }
    }
}

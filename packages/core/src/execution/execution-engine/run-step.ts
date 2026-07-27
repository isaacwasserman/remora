import { rethrowIfUnrecoverable, StepTimeoutError } from "./errors";
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

async function runWithTimeout<T>(
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
 * Applies a step's {@link StepOptions} retry and timeout policy to `fn`. Shared
 * by every engine, so the retry semantics of a step never depend on which engine
 * is running it. Retries are opt-in: with no retry option set, `fn` runs once.
 */
export async function runStep<T>(
    fn: () => Promise<T>,
    options: StepOptions | undefined,
): Promise<T> {
    const retriesEnabled =
        options !== undefined &&
        (options.maxAttempts !== undefined ||
            options.retryDelaySeconds !== undefined ||
            options.backoffCoefficient !== undefined ||
            options.shouldRetry !== undefined);

    const maxAttempts = retriesEnabled ? (options?.maxAttempts ?? 3) : 1;
    const backoffCoefficient = options?.backoffCoefficient ?? 2;
    const maxDelay = options?.maxRetryDelaySeconds ?? Number.POSITIVE_INFINITY;
    let currentDelay = options?.retryDelaySeconds ?? 1;

    for (let attempt = 1; ; attempt++) {
        try {
            return await runWithTimeout(fn, options?.timeoutSeconds);
        } catch (error) {
            // Ahead of the attempt bookkeeping: retrying one of these cannot
            // help, and would spend budget the run has already been told it is
            // out of.
            rethrowIfUnrecoverable(error);
            const message =
                error instanceof Error ? error.message : String(error);
            const outOfAttempts = attempt >= maxAttempts;
            const rejectedByPredicate =
                options?.shouldRetry !== undefined &&
                !options.shouldRetry(message);
            if (outOfAttempts || rejectedByPredicate) {
                throw error;
            }
            await delaySeconds(Math.min(currentDelay, maxDelay));
            currentDelay *= backoffCoefficient;
        }
    }
}

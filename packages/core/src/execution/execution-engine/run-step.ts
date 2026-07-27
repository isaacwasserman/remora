import { rethrowIfUnrecoverable } from "./errors";
import type { StepOptions } from "./types";

export function delaySeconds(seconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

async function runWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutSeconds: number | undefined,
): Promise<T> {
    if (timeoutSeconds === undefined) {
        return fn();
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
            () => reject(new Error(`Step timed out after ${timeoutSeconds}s`)),
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

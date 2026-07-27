import type { DurationLimits } from "../../duration-policy";

/**
 * An error the runtime raises deliberately, where retrying cannot help. Retry
 * logic rethrows these untouched, and step executors must let them escape
 * rather than remapping them onto their own error codes.
 */
export class UnrecoverableExecutionError extends Error {}

/** Raised when a run has spent one of its {@link DurationLimits} budgets. */
export class DurationLimitExceededError extends UnrecoverableExecutionError {
    constructor(
        readonly limit: keyof DurationLimits,
        readonly limitSeconds: number,
    ) {
        super(`Run exceeded its ${limit} budget of ${limitSeconds}s.`);
    }
}

export function rethrowIfUnrecoverable(error: unknown): void {
    if (error instanceof UnrecoverableExecutionError) {
        throw error;
    }
}

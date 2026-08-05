import type { DurationLimits } from "./duration-policy";
import type { ExecutionError } from "../types";

/**
 * An error the runtime raises deliberately, where retrying cannot help. Retry
 * logic rethrows these untouched, and step executors must let them escape
 * rather than remapping them onto their own error codes. `code` is the terminal
 * error code the run reports once one of these reaches the top.
 */
export class UnrecoverableExecutionError extends Error {
    readonly code: ExecutionError["code"] = "UNKNOWN";
}

/** Raised when a run has spent one of its {@link DurationLimits} budgets. */
export class DurationLimitExceededError extends UnrecoverableExecutionError {
    override readonly code = "DURATION_LIMIT_EXCEEDED";

    constructor(
        readonly limit: keyof DurationLimits,
        readonly limitSeconds: number,
    ) {
        super(`Run exceeded its ${limit} budget of ${limitSeconds}s.`);
    }
}

/**
 * Raised when a `for-each` target holds more elements than
 * `structuralLimits.maxLoopIterations` allows. The validator cannot catch this
 * when the target arrives through an expression, so the executor rejects the
 * whole loop before running any iteration of it.
 */
export class LoopIterationLimitExceededError extends UnrecoverableExecutionError {
    override readonly code = "LOOP_ITERATION_LIMIT_EXCEEDED";

    constructor(
        readonly stepId: string,
        readonly iterations: number,
        readonly maxIterations: number,
    ) {
        super(
            `Step "${stepId}" would loop ${iterations} times, exceeding the maximum of ${maxIterations} iterations.`,
        );
    }
}

/**
 * A step that outlived its timeout. Recoverable: the step, not the run, is what
 * ran long, so retrying is meaningful and an executor may map it onto its own
 * error code. Typed rather than a bare `Error` so the caller that imposed the
 * timeout can tell it apart from a failure inside the step.
 */
export class StepTimeoutError extends Error {
    constructor(readonly timeoutSeconds: number) {
        super(`Step timed out after ${timeoutSeconds}s`);
    }
}

export function rethrowIfUnrecoverable(error: unknown): void {
    if (error instanceof UnrecoverableExecutionError) {
        throw error;
    }
}

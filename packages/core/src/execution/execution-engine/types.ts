export type StepOptions = {
    maxAttempts?: number;
    retryDelaySeconds?: number;
    maxRetryDelaySeconds?: number;
    backoffCoefficient?: number;
    timeoutSeconds?: number;
    shouldRetry?: (error: string) => boolean;
};

export type WaitForOptions = {
    pollIntervalSeconds?: number;
    maxWaitSeconds?: number;
    maxAttempts?: number;
    backoffMultiplier?: number;
};

/** A single run of a workflow, as produced by {@link ExecutionEngine.createRun}. */
export interface ExecutionRun {
    getExecutionInfo(): { runId: string };

    step<T>(
        stepName: string,
        fn: () => Promise<T>,
        options?: StepOptions,
    ): Promise<T>;

    sleep(seconds: number): Promise<void>;
}

/**
 * Runs a workflow's operations. Not bound to a particular run — callers create a
 * run-scoped {@link ExecutionRun} from it via {@link createRun} — and makes no
 * claim about durability: whether anything survives a process restart is up to
 * the engine.
 */
export interface ExecutionEngine {
    /**
     * Binds this engine to a specific run. `runId` defaults to a fresh random
     * UUID when omitted.
     */
    createRun(runId?: string): ExecutionRun;
}

/**
 * Identifies one operation within a run, as path segments from the workflow root
 * — e.g. `["loop", "2", "callApi"]` for the `callApi` step in the third
 * iteration of `loop`. @see {@link joinStepPath}
 */
export type StepPath = string[];

export type ExecutionContext = {
    runId: string;

    /**
     * Throws if either run-level duration budget is spent. The timed operations
     * below gate on this themselves; the workflow loop calls it between steps so
     * that a run made up of steps which never reach the context — `start`,
     * `end`, a `switch-case` that only branches — still cannot overrun.
     */
    assertWithinBudget: () => Promise<void>;

    step: <TStepOutput>(
        stepPath: StepPath,
        stepFn: () => Promise<TStepOutput>,
        options?: StepOptions,
    ) => Promise<TStepOutput>;

    /**
     * Delay. The wake-up deadline is produced inside a `step`, so on a
     * checkpointing engine a resumed run serves only the time still remaining —
     * a sleep whose deadline has already passed returns immediately instead of
     * waiting again.
     */
    sleep: (stepPath: StepPath, seconds: number) => Promise<void>;

    /**
     * Polls until `poll` returns a truthy value, then returns that value. Each
     * attempt is a separate `step` keyed `[...stepPath, "attempt", <n>]`, so the
     * attempt number is part of the key and `poll` re-runs on every attempt
     * rather than replaying the first attempt's recorded result.
     *
     * `poll` may be a plain async function, or an async generator when the
     * caller wants to surface progress from inside an attempt — anything it
     * yields is re-yielded here. Either way this returns a generator, so drive
     * it with `yield*` from an enclosing generator to forward those updates and
     * take the settled value:
     * `const value = yield* ctx.waitFor(path, poll, options)`.
     */
    waitFor: <TValue, TUpdate = never>(
        stepPath: StepPath,
        poll: (
            attempt: number,
        ) => Promise<TValue> | AsyncGenerator<TUpdate, TValue>,
        options?: WaitForOptions,
    ) => AsyncGenerator<TUpdate, NonNullable<TValue>>;
};

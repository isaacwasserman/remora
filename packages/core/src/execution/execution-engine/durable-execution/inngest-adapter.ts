import { resolveRetryPolicy, runWithTimeout } from "../run-step";
import type { DurableExecutionAdapter } from "./types";

/**
 * Inngest step tools injected so the package has no runtime dependency on
 * `inngest`. Mirrors the subset of `StepTools` the adapter uses.
 *
 * @example
 * ```ts
 * import { Inngest, NonRetriableError } from "inngest";
 *
 * const inngest = new Inngest({ id: "my-app" });
 *
 * const myFunction = inngest.createFunction(
 *     { id: "my-workflow", retries: 5, triggers: [{ event: "app/workflow.start" }] },
 *     async ({ step, runId }) => {
 *         const adapter = createInngestDurableExecutionAdapter({
 *             runId,
 *             step,
 *             NonRetriableError,
 *         });
 *         const engine = createDurableExecutionEngine(adapter);
 *         const run = engine.createRun();
 *         // ... use run.step / run.sleep as usual
 *     },
 * );
 * ```
 */
export type InngestDurableContext = {
    runId: string;
    step: {
        run: <T>(id: string, fn: () => Promise<T>) => Promise<T>;
        sleep: (id: string, duration: string | number) => Promise<void>;
    };
    NonRetriableError: new (
        message: string,
        options?: { cause?: unknown },
    ) => Error;
};

export function createInngestDurableExecutionAdapter(
    context: InngestDurableContext,
): DurableExecutionAdapter {
    let sleepCounter = 0;

    return {
        getExecutionInfo() {
            return { runId: context.runId };
        },

        step(stepName, fn, options) {
            return context.step.run(stepName, async () => {
                try {
                    return await runWithTimeout(fn, options?.timeoutSeconds);
                } catch (error) {
                    const policy = resolveRetryPolicy(options);
                    if (!policy.isRetriable(error)) {
                        throw new context.NonRetriableError(
                            error instanceof Error
                                ? error.message
                                : String(error),
                            { cause: error },
                        );
                    }
                    throw error;
                }
            });
        },

        async sleep(seconds) {
            await context.step.sleep(`sleep-${sleepCounter++}`, seconds * 1000);
        },
    };
}

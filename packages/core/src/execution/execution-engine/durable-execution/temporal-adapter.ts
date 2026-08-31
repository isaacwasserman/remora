import { resolveRetryPolicy } from "../run-step";
import type { StepOptions } from "../types";
import type { DurableExecutionAdapter } from "./types";

export type TemporalRetryPolicy = {
    maximumAttempts?: number;
    initialInterval?: string;
    maximumInterval?: string;
    backoffCoefficient?: number;
};

export type TemporalActivityOptions = {
    startToCloseTimeout?: string;
    retry?: TemporalRetryPolicy;
};

/**
 * Temporal workflow primitives injected so the package has no runtime
 * dependency on `@temporalio/workflow`. Each step name must match a
 * registered activity; the step function (`fn`) is not used.
 *
 * @example
 * ```ts
 * import { proxyActivities, sleep, workflowInfo } from "@temporalio/workflow";
 * import type * as activities from "./activities";
 *
 * const adapter = createTemporalDurableExecutionAdapter({
 *     workflowInfo,
 *     sleep,
 *     createActivities: (options) => proxyActivities<typeof activities>(options),
 * });
 * ```
 */
export type TemporalDurableContext = {
    workflowInfo: () => { runId: string };
    sleep: (duration: string | number) => Promise<void>;
    createActivities: (
        options: TemporalActivityOptions,
        // biome-ignore lint/suspicious/noExplicitAny: matches Temporal SDK's createActivities signature
    ) => Record<string, (...args: any[]) => Promise<any>>;
};

function stepOptionsToActivityOptions(
    options: StepOptions | undefined,
): TemporalActivityOptions {
    const policy = resolveRetryPolicy(options);
    return {
        startToCloseTimeout: options?.timeoutSeconds
            ? `${options.timeoutSeconds} seconds`
            : undefined,
        retry: {
            maximumAttempts: policy.maxAttempts,
            initialInterval: `${Math.max(1, Math.ceil(policy.delaySecondsAfter(1)))} seconds`,
            maximumInterval: options?.maxRetryDelaySeconds
                ? `${options.maxRetryDelaySeconds} seconds`
                : undefined,
            backoffCoefficient: options?.backoffCoefficient,
        },
    };
}

/**
 * Creates a {@link DurableExecutionAdapter} backed by Temporal. Construct it
 * inside a Temporal workflow and pass it to `createDurableExecutionEngine`.
 */
export function createTemporalDurableExecutionAdapter(
    context: TemporalDurableContext,
): DurableExecutionAdapter {
    return {
        getExecutionInfo() {
            return { runId: context.workflowInfo().runId };
        },

        step(stepName, _fn, options) {
            const activityOptions = stepOptionsToActivityOptions(options);
            const activities = context.createActivities(activityOptions);
            const activity = activities[stepName];
            if (!activity) {
                throw new Error(`Activity "${stepName}" not registered`);
            }
            return activity();
        },

        async sleep(seconds) {
            await context.sleep(seconds * 1000);
        },
    };
}

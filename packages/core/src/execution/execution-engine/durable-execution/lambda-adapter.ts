import type {
    DurableContext,
    Duration,
    RetryDecision,
} from "@aws/durable-execution-sdk-js";
import { resolveRetryPolicy, runWithTimeout } from "../run-step";
import type { StepOptions } from "../types";
import type { DurableExecutionAdapter } from "./types";

function durationFromSeconds(seconds: number): Duration {
    // AWS only accepts whole numbers
    const totalSeconds = Math.max(1, Math.ceil(seconds));
    return { seconds: totalSeconds };
}

function stepOptionsToRetryStrategy(
    options?: StepOptions,
): (error: Error, attemptCount: number) => RetryDecision {
    const policy = resolveRetryPolicy(options);
    return (error, attemptCount) => {
        if (attemptCount >= policy.maxAttempts || !policy.isRetriable(error)) {
            return { shouldRetry: false };
        }
        return {
            shouldRetry: true,
            delay: durationFromSeconds(policy.delaySecondsAfter(attemptCount)),
        };
    };
}

/**
 * Creates a {@link DurableExecutionAdapter} backed by the AWS Lambda Durable
 * Execution SDK, for the one execution `context` belongs to. Construct it inside
 * the handler and pass it to `createDurableExecutionEngine`
 */
export function createLambdaDurableExecutionAdapter(
    context: DurableContext,
): DurableExecutionAdapter {
    return {
        getExecutionInfo() {
            return {
                runId: context.executionContext.durableExecutionArn,
            };
        },

        step(stepName, fn, options) {
            // The timeout stays on this side: the SDK bounds retries, not the
            // wall time of a single attempt.
            return context.step(
                stepName,
                () => runWithTimeout(fn, options?.timeoutSeconds),
                { retryStrategy: stepOptionsToRetryStrategy(options) },
            );
        },

        async sleep(seconds) {
            // Ends the invocation when the wait is long enough to be worth it;
            // the host resumes the run afterwards, so unlike an in-process
            // engine nothing is held open.
            await context.wait(durationFromSeconds(seconds));
        },
    };
}

import type {
  DurableContext as AwsDurableContext,
  Duration,
} from "@aws/durable-execution-sdk-js";
import type { DurableContext } from "../context";

/**
 * Convert milliseconds to an AWS {@link Duration} object.
 * Rounds up to the nearest second.
 */
export function durationFromMs(ms: number): Duration {
  const totalSeconds = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return { hours, minutes, seconds };
  if (minutes > 0) return { minutes, seconds };
  return { seconds };
}

/**
 * Internal state tracked across `waitForCondition` polling iterations
 * inside the AWS adapter.
 */
interface WaitConditionState {
  result: unknown;
  attempt: number;
}

/**
 * Create a remoraflow {@link DurableContext} backed by the
 * AWS Lambda Durable Execution SDK's context.
 *
 * Usage inside a Lambda handler:
 * ```typescript
 * import { withDurableExecution, DurableContext } from "@aws/durable-execution-sdk-js";
 * import { createAwsLambdaDurableContext } from "@remoraflow/core/adapters/aws-lambda";
 * import { executeWorkflow } from "@remoraflow/core";
 *
 * export const handler = withDurableExecution(async (event, awsContext) => {
 *   const context = createAwsLambdaDurableContext(awsContext);
 *   return executeWorkflow(myWorkflow, { tools, context });
 * });
 * ```
 */
export function createAwsLambdaDurableContext(
  aws: AwsDurableContext,
): DurableContext {
  return {
    step: (name, fn) => aws.step(name, fn as () => Promise<never>),

    sleep: (name, durationMs) => aws.wait(name, durationFromMs(durationMs)),

    waitForCondition: async (name, checkFn, opts) => {
      const state = await aws.waitForCondition<WaitConditionState>(
        name,
        async (current) => {
          const result = await checkFn();
          return { result, attempt: current.attempt + 1 };
        },
        {
          initialState: { result: null, attempt: 0 },
          waitStrategy: (current, attempt) => {
            // If checkFn returned a truthy value, we're done
            if (current.result) {
              return { shouldContinue: false };
            }

            // Check maxAttempts
            if (attempt >= opts.maxAttempts) {
              return { shouldContinue: false };
            }

            // Compute delay with backoff
            const delay =
              opts.intervalMs * opts.backoffMultiplier ** (attempt - 1);

            return {
              shouldContinue: true,
              delay: durationFromMs(delay),
            };
          },
        },
      );

      return state.result;
    },

    waitForCallback: async (name, submitter, timeoutMs) => {
      return aws.waitForCallback(
        name,
        async (callbackId) => {
          await submitter(callbackId);
        },
        timeoutMs ? { timeout: durationFromMs(timeoutMs) } : undefined,
      );
    },
  };
}

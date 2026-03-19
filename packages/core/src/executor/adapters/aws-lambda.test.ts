import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  type DurableContext as AwsDurableContext,
  withDurableExecution,
} from "@aws/durable-execution-sdk-js";
import {
  LocalDurableTestRunner,
  WaitingOperationStatus,
} from "@aws/durable-execution-sdk-js-testing";
import { createAwsLambdaDurableContext, durationFromMs } from "./aws-lambda";

// ─── durationFromMs unit tests ──────────────────────────────────

describe("durationFromMs", () => {
  test("sub-second values round up to 1 second", () => {
    expect(durationFromMs(1)).toEqual({ seconds: 1 });
    expect(durationFromMs(500)).toEqual({ seconds: 1 });
    expect(durationFromMs(999)).toEqual({ seconds: 1 });
  });

  test("exact seconds", () => {
    expect(durationFromMs(1000)).toEqual({ seconds: 1 });
    expect(durationFromMs(5000)).toEqual({ seconds: 5 });
    expect(durationFromMs(30_000)).toEqual({ seconds: 30 });
    expect(durationFromMs(59_000)).toEqual({ seconds: 59 });
  });

  test("minutes and seconds", () => {
    expect(durationFromMs(60_000)).toEqual({ minutes: 1, seconds: 0 });
    expect(durationFromMs(90_000)).toEqual({ minutes: 1, seconds: 30 });
    expect(durationFromMs(3_599_000)).toEqual({ minutes: 59, seconds: 59 });
  });

  test("hours, minutes, and seconds", () => {
    expect(durationFromMs(3_600_000)).toEqual({
      hours: 1,
      minutes: 0,
      seconds: 0,
    });
    expect(durationFromMs(5_400_000)).toEqual({
      hours: 1,
      minutes: 30,
      seconds: 0,
    });
    expect(durationFromMs(259_200_000)).toEqual({
      hours: 72,
      minutes: 0,
      seconds: 0,
    });
  });

  test("rounds up partial seconds", () => {
    // 1001ms → 2 seconds
    expect(durationFromMs(1001)).toEqual({ seconds: 2 });
    // 60001ms → 1 min 1 sec
    expect(durationFromMs(60_001)).toEqual({ minutes: 1, seconds: 1 });
  });
});

// ─── Integration tests with LocalDurableTestRunner ──────────────

describe("AWS Lambda adapter integration", () => {
  beforeAll(() =>
    LocalDurableTestRunner.setupTestEnvironment({ skipTime: true }),
  );
  afterAll(() => LocalDurableTestRunner.teardownTestEnvironment());

  test("step passthrough — executes and returns result", async () => {
    const handler = withDurableExecution(
      async (_event: unknown, awsContext: AwsDurableContext) => {
        const ctx = createAwsLambdaDurableContext(awsContext);
        return ctx.step("my-step", async () => ({ value: 42 }));
      },
    );

    const runner = new LocalDurableTestRunner({ handlerFunction: handler });
    const execution = await runner.run({ payload: {} });

    expect(execution.getStatus()).toBe("SUCCEEDED");
    expect(execution.getResult()).toEqual({ value: 42 });

    const stepOp = runner.getOperation("my-step");
    await stepOp.waitForData(WaitingOperationStatus.COMPLETED);
    const details = stepOp.getStepDetails();
    expect(details?.result).toEqual({ value: 42 });
  });

  test("sleep converts ms to Duration", async () => {
    const handler = withDurableExecution(
      async (_event: unknown, awsContext: AwsDurableContext) => {
        const ctx = createAwsLambdaDurableContext(awsContext);
        await ctx.sleep("nap", 5000);
        return "done";
      },
    );

    const runner = new LocalDurableTestRunner({ handlerFunction: handler });
    const execution = await runner.run({ payload: {} });

    expect(execution.getStatus()).toBe("SUCCEEDED");
    expect(execution.getResult()).toBe("done");

    const waitOp = runner.getOperation("nap");
    await waitOp.waitForData(WaitingOperationStatus.COMPLETED);
    const details = waitOp.getWaitDetails();
    expect(details?.waitSeconds).toBe(5);
  });

  test("waitForCallback — creates callback and resolves on success", async () => {
    const handler = withDurableExecution(
      async (_event: unknown, awsContext: AwsDurableContext) => {
        const ctx = createAwsLambdaDurableContext(awsContext);
        const result = await ctx.waitForCallback?.(
          "approval",
          async (_callbackId) => {
            // In production this would notify an external system
          },
          30_000,
        );
        return result;
      },
    );

    const runner = new LocalDurableTestRunner({ handlerFunction: handler });
    // Run without awaiting — we need to send the callback before it completes
    const executionPromise = runner.run({ payload: {} });

    // Wait for the callback to be submitted
    const callbackOp = runner.getOperation("approval");
    await callbackOp.waitForData(WaitingOperationStatus.SUBMITTED);

    // Send approval
    await callbackOp.sendCallbackSuccess("approved!");

    const execution = await executionPromise;
    expect(execution.getStatus()).toBe("SUCCEEDED");
    expect(execution.getResult()).toBe("approved!");
  });

  test("waitForCondition — polls until truthy result", async () => {
    let checkCount = 0;

    const handler = withDurableExecution(
      async (_event: unknown, awsContext: AwsDurableContext) => {
        const ctx = createAwsLambdaDurableContext(awsContext);
        const result = await ctx.waitForCondition(
          "poll-check",
          async () => {
            checkCount++;
            if (checkCount >= 3) return { ready: true };
            return null;
          },
          {
            maxAttempts: 10,
            intervalMs: 1000,
            backoffMultiplier: 1,
          },
        );
        return result;
      },
    );

    const runner = new LocalDurableTestRunner({ handlerFunction: handler });
    const execution = await runner.run({ payload: {} });

    expect(execution.getStatus()).toBe("SUCCEEDED");
    expect(execution.getResult()).toEqual({ ready: true });
    expect(checkCount).toBe(3);
  });

  test("multiple steps in sequence", async () => {
    const handler = withDurableExecution(
      async (_event: unknown, awsContext: AwsDurableContext) => {
        const ctx = createAwsLambdaDurableContext(awsContext);
        const a = (await ctx.step("step-a", async () => 10)) as number;
        const b = (await ctx.step("step-b", async () => a * 2)) as number;
        return b;
      },
    );

    const runner = new LocalDurableTestRunner({ handlerFunction: handler });
    const execution = await runner.run({ payload: {} });

    expect(execution.getStatus()).toBe("SUCCEEDED");
    expect(execution.getResult()).toBe(20);
    expect(execution.getOperations()).toHaveLength(2);
  });
});

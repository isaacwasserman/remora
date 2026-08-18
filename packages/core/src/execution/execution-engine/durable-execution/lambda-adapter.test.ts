import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { withDurableExecution } from "@aws/durable-execution-sdk-js";
import { LocalDurableTestRunner } from "@aws/durable-execution-sdk-js-testing";
import { testPolicies } from "../../test-support";
import { createExecutionContext } from "../context";
import type { ExecutionRun } from "../types";
import { createDurableExecutionEngine } from ".";
import { createLambdaDurableExecutionAdapter } from "./lambda-adapter";

/**
 * Drives `body` through a real durable execution: the local runner journals
 * every operation and re-invokes the handler after a suspend, so what the
 * adapter claims about replay is observed rather than asserted.
 */
function runnerFor<TResult>(body: (run: ExecutionRun) => Promise<TResult>) {
    return new LocalDurableTestRunner<TResult>({
        handlerFunction: withDurableExecution(async (_event, context) => {
            const engine = createDurableExecutionEngine(
                createLambdaDurableExecutionAdapter(context),
            );
            return body(engine.createRun());
        }),
    });
}

beforeAll(async () => {
    await LocalDurableTestRunner.setupTestEnvironment({ skipTime: true });
});

afterAll(async () => {
    await LocalDurableTestRunner.teardownTestEnvironment();
});

describe("lambda durable execution adapter", () => {
    test("a step completed before a suspend is not re-executed after it", async () => {
        const calls: string[] = [];
        const runner = runnerFor(async (run) => {
            const before = await run.step("before", async () => {
                calls.push("before");
                return 1;
            });
            await run.sleep(600);
            const after = await run.step("after", async () => {
                calls.push("after");
                return before + 1;
            });
            return after;
        });

        const execution = await runner.run();

        expect(execution.getResult()).toBe(2);
        // The wait ended the invocation, so the handler ran again — and `before`
        // replayed from the journal instead of executing a second time.
        expect(execution.getInvocations().length).toBeGreaterThan(1);
        expect(calls).toEqual(["before", "after"]);
    });

    test("step names become operation names", async () => {
        const runner = runnerFor(async (run) => {
            await run.step("root/child", async () => "a");
            return "done";
        });

        const execution = await runner.run();

        expect(execution.getResult()).toBe("done");
        expect(runner.getOperation("root/child").getStepDetails()?.result).toBe(
            "a",
        );
    });

    test("the run id is the host's, and survives a suspend", async () => {
        const seen: string[] = [];
        const runner = runnerFor(async (run) => {
            seen.push(run.getExecutionInfo().runId);
            await run.sleep(600);
            seen.push(run.getExecutionInfo().runId);
            return run.getExecutionInfo().runId;
        });

        const runId = (await runner.run()).getResult();

        expect(runId).toBeTruthy();
        // Reported by the host rather than minted per invocation, so every
        // invocation of the same execution agrees.
        expect(seen.length).toBeGreaterThan(1);
        expect(new Set(seen)).toEqual(new Set([runId as string]));
    });

    test("a sleep becomes a wait for the requested duration", async () => {
        const runner = runnerFor(async (run) => {
            await run.sleep(90);
            return "woke";
        });

        const execution = await runner.run();

        expect(execution.getResult()).toBe("woke");
        const waits = execution
            .getOperations()
            .filter((operation) => operation.getType() === "WAIT");
        expect(waits).toHaveLength(1);
        expect(waits[0]?.getWaitDetails()?.waitSeconds).toBe(90);
    });

    test("a sub-second sleep rounds up rather than being rejected", async () => {
        // AWS durations are whole positive units, so a zero-length delay — which
        // our poll loop can produce — has to become the smallest legal wait.
        const runner = runnerFor(async (run) => {
            await run.sleep(0);
            return "woke";
        });

        const execution = await runner.run();

        expect(execution.getResult()).toBe("woke");
        const waits = execution
            .getOperations()
            .filter((operation) => operation.getType() === "WAIT");
        expect(waits[0]?.getWaitDetails()?.waitSeconds).toBe(1);
    });

    test("the host retries a failing step up to maxAttempts", async () => {
        let attempts = 0;
        const runner = runnerFor(async (run) =>
            run.step(
                "flaky",
                async () => {
                    attempts++;
                    if (attempts < 3) {
                        throw new Error("transient");
                    }
                    return "recovered";
                },
                { maxAttempts: 3, retryDelaySeconds: 1 },
            ),
        );

        const execution = await runner.run();

        expect(execution.getResult()).toBe("recovered");
        expect(attempts).toBe(3);
    });

    test("a step with no retry options runs once", async () => {
        let attempts = 0;
        const runner = runnerFor(async (run) =>
            run.step("once", async () => {
                attempts++;
                throw new Error("boom");
            }),
        );

        const execution = await runner.run();

        expect(execution.getError().errorMessage).toContain("boom");
        expect(attempts).toBe(1);
    });

    test("shouldRetry rejecting an error stops the retries", async () => {
        let attempts = 0;
        const runner = runnerFor(async (run) =>
            run.step(
                "fatal",
                async () => {
                    attempts++;
                    throw new Error("not worth retrying");
                },
                {
                    maxAttempts: 5,
                    retryDelaySeconds: 1,
                    shouldRetry: (message) => message !== "not worth retrying",
                },
            ),
        );

        const execution = await runner.run();

        expect(execution.getError().errorMessage).toContain(
            "not worth retrying",
        );
        expect(attempts).toBe(1);
    });

    test("the execution context's policed sleep survives the suspend it causes", async () => {
        // The context records a wake-up deadline in its own step before
        // delaying, so the resumed invocation owes no time — but it must still
        // issue the delay, or every later operation lands on the journal entry
        // before it and the host stalls the run on a replay inconsistency.
        const calls: string[] = [];
        const runner = runnerFor(async (run) => {
            const context = createExecutionContext(run, testPolicies());
            await context.step(["first"], async () => {
                calls.push("first");
                return 1;
            });
            await context.sleep(["nap"], 600);
            await context.step(["second"], async () => {
                calls.push("second");
                return 2;
            });
            return "done";
        });

        const execution = await runner.run();

        expect(execution.getResult()).toBe("done");
        expect(execution.getInvocations().length).toBeGreaterThan(1);
        expect(calls).toEqual(["first", "second"]);
    });

    test("a step outliving its timeout fails with the step timeout", async () => {
        const runner = runnerFor(async (run) =>
            run.step(
                "slow",
                () => new Promise((resolve) => setTimeout(resolve, 60_000)),
                { timeoutSeconds: 1 },
            ),
        );

        const execution = await runner.run();

        expect(execution.getError().errorMessage).toContain("timed out");
    });
});

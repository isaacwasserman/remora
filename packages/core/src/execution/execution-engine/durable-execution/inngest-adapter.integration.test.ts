import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Inngest, NonRetriableError } from "inngest";
import { serve } from "inngest/bun";
import { createDurableExecutionEngine } from ".";
import { createInngestDurableExecutionAdapter } from "./inngest-adapter";

const DEV_PORT = 19288;
const APP_PORT = 19289;

process.env.INNGEST_DEV = `http://127.0.0.1:${DEV_PORT}`;

const silentLogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
};
const inngest = new Inngest({
    id: "test-app",
    eventKey: "test",
    logger: silentLogger,
});

// ---------------------------------------------------------------------------
// Signaling: each test awaits a promise that the Inngest function resolves or
// rejects when it finishes. This avoids polling the dev server API.
// ---------------------------------------------------------------------------

type Signal = ReturnType<typeof Promise.withResolvers<unknown>>;
const pending = new Map<string, Signal>();

function awaitRun<T>(testId: string, timeoutMs = 30_000): Promise<T> {
    const signal = Promise.withResolvers<unknown>();
    pending.set(testId, signal);
    const timer = setTimeout(
        () => signal.reject(new Error(`Timeout: ${testId}`)),
        timeoutMs,
    );
    return signal.promise.finally(() => clearTimeout(timer)) as Promise<T>;
}

// ---------------------------------------------------------------------------
// Per-test counters — survive across Inngest re-invocations because the same
// process serves every request.
// ---------------------------------------------------------------------------

const stepCalls = new Map<string, string[]>();
const attempts = new Map<string, number>();

function trackStep(testId: string, name: string) {
    if (!stepCalls.has(testId)) stepCalls.set(testId, []);
    stepCalls.get(testId)?.push(name);
}

function trackAttempt(testId: string): number {
    const n = (attempts.get(testId) ?? 0) + 1;
    attempts.set(testId, n);
    return n;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// biome-ignore lint/suspicious/noExplicitAny: Inngest's StepTools type is generic and framework-coupled
function adapterRun(runId: string, step: any) {
    return createDurableExecutionEngine(
        createInngestDurableExecutionAdapter({
            runId,
            step,
            NonRetriableError,
        }),
    ).createRun();
}

// biome-ignore lint/suspicious/noExplicitAny: onFailure event shape is deeply nested and framework-typed
function failureHandler({ error, event }: any) {
    const testId = event?.data?.event?.data?.testId;
    if (testId) pending.get(testId)?.reject(error);
}

// ---------------------------------------------------------------------------
// Inngest functions
// ---------------------------------------------------------------------------

const singleStepFn = inngest.createFunction(
    {
        id: "single-step",
        retries: 0,
        triggers: [{ event: "test/single-step" }],
    },
    async ({ step, runId, event }) => {
        const run = adapterRun(runId, step);
        const result = await run.step("greet", async () => "Hello, Inngest!");
        pending.get(event.data.testId as string)?.resolve(result);
        return result;
    },
);

const returnRunIdFn = inngest.createFunction(
    {
        id: "return-run-id",
        retries: 0,
        triggers: [{ event: "test/return-run-id" }],
    },
    async ({ step, runId, event }) => {
        const run = adapterRun(runId, step);
        const id = run.getExecutionInfo().runId;
        pending.get(event.data.testId as string)?.resolve(id);
        return id;
    },
);

const sleepFn = inngest.createFunction(
    { id: "sleep-only", retries: 0, triggers: [{ event: "test/sleep" }] },
    async ({ step, runId, event }) => {
        const run = adapterRun(runId, step);
        await run.sleep(1);
        pending.get(event.data.testId as string)?.resolve("woke");
        return "woke";
    },
);

const stepSleepStepFn = inngest.createFunction(
    {
        id: "step-sleep-step",
        retries: 0,
        triggers: [{ event: "test/step-sleep-step" }],
    },
    async ({ step, runId, event }) => {
        const testId = event.data.testId as string;
        const run = adapterRun(runId, step);
        const before = await run.step("before", async () => {
            trackStep(testId, "before");
            return 1;
        });
        await run.sleep(1);
        const after = await run.step("after", async () => {
            trackStep(testId, "after");
            return 2;
        });
        const result = { before, after };
        pending.get(testId)?.resolve(result);
        return result;
    },
);

const retryFn = inngest.createFunction(
    { id: "retry-step", retries: 5, triggers: [{ event: "test/retry" }] },
    async ({ step, runId, event }) => {
        const testId = event.data.testId as string;
        const run = adapterRun(runId, step);
        const result = await run.step("flaky", async () => {
            const n = trackAttempt(testId);
            if (n < 3) throw new Error("transient");
            return "recovered";
        });
        pending.get(testId)?.resolve(result);
        return result;
    },
);

const noRetryFn = inngest.createFunction(
    {
        id: "no-retry",
        retries: 0,
        onFailure: failureHandler,
        triggers: [{ event: "test/no-retry" }],
    },
    async ({ step, runId, event }) => {
        const testId = event.data.testId as string;
        const run = adapterRun(runId, step);
        return run.step("always-fails", async () => {
            trackAttempt(testId);
            throw new Error("boom");
        });
    },
);

const shouldRetryFn = inngest.createFunction(
    {
        id: "should-retry-stop",
        retries: 5,
        onFailure: failureHandler,
        triggers: [{ event: "test/should-retry" }],
    },
    async ({ step, runId, event }) => {
        const testId = event.data.testId as string;
        const run = adapterRun(runId, step);
        return run.step(
            "fatal",
            async () => {
                trackAttempt(testId);
                throw new Error("permanent");
            },
            { maxAttempts: 5, retryDelaySeconds: 1, shouldRetry: () => false },
        );
    },
);

const timeoutFn = inngest.createFunction(
    {
        id: "timeout-step",
        retries: 0,
        onFailure: failureHandler,
        triggers: [{ event: "test/timeout" }],
    },
    async ({ step, runId }) => {
        const run = adapterRun(runId, step);
        return run.step(
            "slow",
            () => new Promise((resolve) => setTimeout(resolve, 60_000)),
            { timeoutSeconds: 1 },
        );
    },
);

// ---------------------------------------------------------------------------
// Serve all functions on one HTTP endpoint
// ---------------------------------------------------------------------------

const inngestHandler = serve({
    client: inngest,
    functions: [
        singleStepFn,
        returnRunIdFn,
        sleepFn,
        stepSleepStepFn,
        retryFn,
        noRetryFn,
        shouldRetryFn,
        timeoutFn,
    ],
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let devServer: ReturnType<typeof Bun.spawn>;
let appServer: ReturnType<typeof Bun.serve>;

describe("inngest durable execution adapter (dev server)", () => {
    beforeAll(async () => {
        appServer = Bun.serve({
            port: APP_PORT,
            fetch(req) {
                const url = new URL(req.url);
                if (url.pathname === "/api/inngest") return inngestHandler(req);
                return new Response("Not found", { status: 404 });
            },
        });

        devServer = Bun.spawn(
            [
                "npx",
                "--ignore-scripts=false",
                "inngest-cli@latest",
                "dev",
                "--port",
                String(DEV_PORT),
                "--no-discovery",
                "--retry-interval",
                "1",
                "-u",
                `http://127.0.0.1:${APP_PORT}/api/inngest`,
            ],
            { stdout: "ignore", stderr: "ignore" },
        );

        const deadline = Date.now() + 30_000;
        while (Date.now() < deadline) {
            try {
                const res = await fetch(`http://127.0.0.1:${DEV_PORT}/dev`);
                if (res.ok) break;
            } catch {
                // Dev server not ready yet
            }
            await Bun.sleep(500);
        }

        await fetch(`http://127.0.0.1:${APP_PORT}/api/inngest`, {
            method: "PUT",
        });
        await Bun.sleep(2_000);
    }, 60_000);

    afterAll(async () => {
        appServer?.stop(true);
        devServer?.kill();
    });
    test("step executes and returns the result", async () => {
        const p = awaitRun<string>("single-step");
        await inngest.send({
            name: "test/single-step",
            data: { testId: "single-step" },
        });
        expect(await p).toBe("Hello, Inngest!");
    });

    test("the run id is Inngest's and is a non-empty string", async () => {
        const p = awaitRun<string>("run-id");
        await inngest.send({
            name: "test/return-run-id",
            data: { testId: "run-id" },
        });
        const runId = await p;
        expect(typeof runId).toBe("string");
        expect(runId.length).toBeGreaterThan(0);
    });

    test("a sleep completes via Inngest's durable timer", async () => {
        const p = awaitRun<string>("sleep");
        await inngest.send({
            name: "test/sleep",
            data: { testId: "sleep" },
        });
        expect(await p).toBe("woke");
    }, 15_000);

    test("steps before and after a sleep both execute once", async () => {
        const testId = "step-sleep-step";
        const p = awaitRun<{ before: number; after: number }>(testId);
        await inngest.send({
            name: "test/step-sleep-step",
            data: { testId },
        });
        expect(await p).toEqual({ before: 1, after: 2 });
        expect(stepCalls.get(testId)).toEqual(["before", "after"]);
    }, 15_000);

    test("the host retries a failing step and it recovers", async () => {
        const testId = "retry";
        const p = awaitRun<string>(testId);
        await inngest.send({
            name: "test/retry",
            data: { testId },
        });
        expect(await p).toBe("recovered");
        expect(attempts.get(testId)).toBe(3);
    }, 30_000);

    test("a step with no retry options runs once then fails", async () => {
        const testId = "no-retry";
        const p = awaitRun(testId);
        await inngest.send({
            name: "test/no-retry",
            data: { testId },
        });
        await expect(p).rejects.toThrow();
        expect(attempts.get(testId)).toBe(1);
    }, 15_000);

    test("shouldRetry rejecting an error stops retries immediately", async () => {
        const testId = "should-retry";
        const p = awaitRun(testId);
        await inngest.send({
            name: "test/should-retry",
            data: { testId },
        });
        await expect(p).rejects.toThrow();
        expect(attempts.get(testId)).toBe(1);
    }, 15_000);

    test("timeoutSeconds fails the step when fn exceeds it", async () => {
        const testId = "timeout";
        const p = awaitRun(testId);
        await inngest.send({
            name: "test/timeout",
            data: { testId },
        });
        await expect(p).rejects.toThrow();
    }, 15_000);
});

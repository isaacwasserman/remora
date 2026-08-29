import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Client, Connection, WorkflowFailedError } from "@temporalio/client";
import {
    bundleWorkflowCode,
    DefaultLogger,
    NativeConnection,
    Runtime,
    Worker,
} from "@temporalio/worker";

Runtime.install({ logger: new DefaultLogger("ERROR") });

const TEMPORAL_PORT = 17233;
const TEMPORAL_ADDRESS = `127.0.0.1:${TEMPORAL_PORT}`;

let devServer: ReturnType<typeof Bun.spawn>;
let nativeConnection: NativeConnection;
let client: Client;
let workflowBundle: { code: string };

let seq = 0;
function nextQueue() {
    return `temporal-cli-adapter-${++seq}`;
}

async function createWorker(
    taskQueue: string,
    // biome-ignore lint/suspicious/noExplicitAny: Temporal activity signatures are untyped records
    activities: Record<string, (...args: any[]) => Promise<any>>,
) {
    return Worker.create({
        connection: nativeConnection,
        taskQueue,
        workflowBundle,
        activities,
    });
}

describe("temporal durable execution adapter (dev server)", () => {
    beforeAll(async () => {
        devServer = Bun.spawn(
            [
                "temporal",
                "server",
                "start-dev",
                "--port",
                String(TEMPORAL_PORT),
                "--log-level",
                "error",
            ],
            { stdout: "ignore", stderr: "ignore" },
        );

        const deadline = Date.now() + 30_000;
        while (Date.now() < deadline) {
            try {
                const probe = await Connection.connect({
                    address: TEMPORAL_ADDRESS,
                });
                await probe.close();
                break;
            } catch {
                await Bun.sleep(500);
            }
        }

        const connection = await Connection.connect({
            address: TEMPORAL_ADDRESS,
        });
        client = new Client({ connection });
        nativeConnection = await NativeConnection.connect({
            address: TEMPORAL_ADDRESS,
        });

        workflowBundle = await bundleWorkflowCode({
            workflowsPath: require.resolve("./temporal-test-workflows"),
            logger: new DefaultLogger("ERROR"),
        });
    }, 60_000);

    afterAll(async () => {
        try {
            await nativeConnection?.close();
        } catch {
            // Already closed or never connected
        }
        devServer?.kill();
    });
    test("step calls the activity matching the step name", async () => {
        const taskQueue = nextQueue();
        const worker = await createWorker(taskQueue, {
            greet: async () => "Hello, Temporal!",
        });

        const result = await worker.runUntil(
            client.workflow.execute("singleStepWorkflow", {
                workflowId: `step-${seq}`,
                taskQueue,
            }),
        );

        expect(result).toBe("Hello, Temporal!");
    });

    test("the run id is Temporal's and is a non-empty string", async () => {
        const taskQueue = nextQueue();
        const worker = await createWorker(taskQueue, {});

        const result = await worker.runUntil(
            client.workflow.execute("returnRunIdWorkflow", {
                workflowId: `runid-${seq}`,
                taskQueue,
            }),
        );

        expect(typeof result).toBe("string");
        expect((result as string).length).toBeGreaterThan(0);
    });

    test("a sleep completes via Temporal's durable timer", async () => {
        const taskQueue = nextQueue();
        const worker = await createWorker(taskQueue, {});

        const result = await worker.runUntil(
            client.workflow.execute("sleepWorkflow", {
                workflowId: `sleep-${seq}`,
                taskQueue,
            }),
        );

        expect(result).toBe("woke");
    }, 15_000);

    test("steps before and after a sleep both execute once", async () => {
        const calls: string[] = [];
        const taskQueue = nextQueue();
        const worker = await createWorker(taskQueue, {
            before: async () => {
                calls.push("before");
                return 1;
            },
            after: async () => {
                calls.push("after");
                return 2;
            },
        });

        const result = await worker.runUntil(
            client.workflow.execute("stepSleepStepWorkflow", {
                workflowId: `step-sleep-step-${seq}`,
                taskQueue,
            }),
        );

        expect(result).toEqual({ before: 1, after: 2 });
        expect(calls).toEqual(["before", "after"]);
    }, 15_000);

    test("the host retries a failing activity up to maxAttempts", async () => {
        let attempts = 0;
        const taskQueue = nextQueue();
        const worker = await createWorker(taskQueue, {
            flaky: async () => {
                attempts++;
                if (attempts < 3) throw new Error("transient");
                return "recovered";
            },
        });

        const result = await worker.runUntil(
            client.workflow.execute("retryStepWorkflow", {
                workflowId: `retry-${seq}`,
                taskQueue,
            }),
        );

        expect(result).toBe("recovered");
        expect(attempts).toBe(3);
    }, 30_000);

    test("a step with no retry options runs once then fails", async () => {
        let attempts = 0;
        const taskQueue = nextQueue();
        const worker = await createWorker(taskQueue, {
            alwaysFails: async () => {
                attempts++;
                throw new Error("boom");
            },
        });

        const execution = client.workflow.execute("noRetryStepWorkflow", {
            workflowId: `no-retry-${seq}`,
            taskQueue,
        });

        await expect(worker.runUntil(execution)).rejects.toThrow(
            WorkflowFailedError,
        );
        expect(attempts).toBe(1);
    });

    test("timeoutSeconds becomes startToCloseTimeout on the activity", async () => {
        const taskQueue = nextQueue();
        const worker = await Worker.create({
            connection: nativeConnection,
            taskQueue,
            workflowBundle,
            activities: {
                slow: () =>
                    new Promise<void>((resolve) => {
                        const t = setTimeout(resolve, 60_000);
                        if (typeof t === "object" && "unref" in t) t.unref();
                    }),
            },
            shutdownGraceTime: "2s",
        });

        const handle = await client.workflow.start("timeoutStepWorkflow", {
            workflowId: `timeout-${seq}`,
            taskQueue,
        });

        const workerDone = worker.run().catch(() => {});
        try {
            await expect(handle.result()).rejects.toThrow(WorkflowFailedError);
        } finally {
            worker.shutdown();
            await Promise.race([workerDone, Bun.sleep(3_000)]);
        }
    }, 30_000);
});

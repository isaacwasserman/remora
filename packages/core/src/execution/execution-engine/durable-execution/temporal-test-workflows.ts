import {
    type ActivityOptions,
    proxyActivities,
    sleep,
    workflowInfo,
} from "@temporalio/workflow";
import { createDurableExecutionEngine } from ".";
import { createTemporalDurableExecutionAdapter } from "./temporal-adapter";

function createAdapter() {
    return createTemporalDurableExecutionAdapter({
        workflowInfo,
        sleep: sleep as (duration: string | number) => Promise<void>,
        createActivities: (options) =>
            proxyActivities({
                startToCloseTimeout: options.startToCloseTimeout ?? "1 minute",
                retry: options.retry,
            } as ActivityOptions),
    });
}

function createRun() {
    return createDurableExecutionEngine(createAdapter()).createRun();
}

export async function singleStepWorkflow(): Promise<unknown> {
    const run = createRun();
    return run.step("greet", async () => "ignored");
}

export async function returnRunIdWorkflow(): Promise<string> {
    const run = createRun();
    return run.getExecutionInfo().runId;
}

export async function stepSleepStepWorkflow(): Promise<unknown> {
    const run = createRun();
    const before = await run.step("before", async () => "ignored");
    await run.sleep(1);
    const after = await run.step("after", async () => "ignored");
    return { before, after };
}

export async function retryStepWorkflow(): Promise<unknown> {
    const run = createRun();
    return run.step("flaky", async () => "ignored", {
        maxAttempts: 3,
        retryDelaySeconds: 1,
    });
}

export async function noRetryStepWorkflow(): Promise<unknown> {
    const run = createRun();
    return run.step("alwaysFails", async () => "ignored");
}

export async function sleepWorkflow(): Promise<string> {
    const run = createRun();
    await run.sleep(1);
    return "woke";
}

export async function timeoutStepWorkflow(): Promise<unknown> {
    const run = createRun();
    return run.step("slow", async () => "ignored", {
        timeoutSeconds: 2,
    });
}

import { describe, expect, test } from "bun:test";
import { createOpenAI } from "@ai-sdk/openai";
import { jsonSchemaToType } from "@ark/json-schema";
import type { DeepPartial } from "ai";
import { type } from "arktype";
import type { JSONSchema7 } from "json-schema";
import { executeWorkflow } from "../execution";
import type { WorkflowDefinition } from "../schema";
import type { ToolSet } from "../types";
import { validateWorkflowDefinition } from "../validation";
import {
    type GenerationOutput,
    generateWorkflowStream,
    type WorkflowGenerationDiagnosticEvent,
} from "./index";
import { requestedOutputSchemaDiagnostics } from "./output-schema";

const apiKey = process.env.OPENROUTER_API_KEY;
const modelId = process.env.OPENROUTER_MODEL_ID;
const describeLive = apiKey && modelId ? describe : describe.skip;

const openrouter = createOpenAI({
    apiKey: apiKey ?? "missing-openrouter-api-key",
    baseURL: "https://openrouter.ai/api/v1",
});
const model = openrouter.chat(modelId ?? "missing-openrouter-model-id");

const GENERATION_TIMEOUT_MS = 180_000;
const GENERATION_OUTER_TIMEOUT_MS = 210_000;
const EXECUTION_TIMEOUT_MS = 300_000;
const MAX_CONCURRENT_GENERATIONS = 5;
const MAX_GENERATION_WAVES = Math.ceil(5 / MAX_CONCURRENT_GENERATIONS);
const SCENARIO_TEST_TIMEOUT_MS =
    GENERATION_OUTER_TIMEOUT_MS * MAX_GENERATION_WAVES + EXECUTION_TIMEOUT_MS;

let activeGenerations = 0;
const generationWaiters: Array<() => void> = [];

async function withGenerationSlot<T>(run: () => Promise<T>): Promise<T> {
    if (activeGenerations >= MAX_CONCURRENT_GENERATIONS) {
        await new Promise<void>((resolve) => generationWaiters.push(resolve));
    }
    activeGenerations += 1;
    try {
        return await run();
    } finally {
        activeGenerations -= 1;
        generationWaiters.shift()?.();
    }
}

type ToolFixture<TCalls> = {
    tools: ToolSet;
    calls: TCalls;
};

type ExecutionCase<TConfig, TCalls> = {
    name: string;
    config: TConfig;
    expectedOutput: unknown;
    assertCalls?: (calls: TCalls) => void;
};

type GenerationScenario<TConfig, TCalls> = {
    name: string;
    taskDescription: string;
    outputSchema: JSONSchema7;
    createTools: (config: TConfig) => ToolFixture<TCalls>;
    cases: ExecutionCase<TConfig, TCalls>[];
};

type GenerationAttempt = {
    attempt: number;
    definition: DeepPartial<WorkflowDefinition>;
    workflowDiagnostics: ReturnType<
        typeof validateWorkflowDefinition
    >["diagnostics"];
    outputSchemaDiagnostics: ReturnType<
        typeof requestedOutputSchemaDiagnostics
    >;
};

async function collectGenerationOutput(
    scenarioName: string,
    taskDescription: string,
    workflowOutputSchema: JSONSchema7,
    tools: ToolSet,
): Promise<GenerationOutput> {
    const attempts: GenerationAttempt[] = [];
    const generationDiagnostics: WorkflowGenerationDiagnosticEvent[] = [];
    const generationStartedAt = Date.now();
    const generationOptions = {};
    const stream = generateWorkflowStream({
        taskDescription,
        workflowOutputSchema: jsonSchemaToType(workflowOutputSchema as object),
        tools,
        options: generationOptions,
        model,
        maxGenerationSteps: 20,
        timeoutMs: GENERATION_TIMEOUT_MS,
        onDiagnosticEvent: (event) => generationDiagnostics.push(event),
    });

    try {
        while (true) {
            const next = await stream.next();
            if (!next.done) {
                const validation = validateWorkflowDefinition(
                    next.value as WorkflowDefinition,
                    { tools, options: generationOptions },
                );
                attempts.push({
                    attempt: attempts.length + 1,
                    definition: next.value,
                    workflowDiagnostics: validation.diagnostics,
                    outputSchemaDiagnostics: requestedOutputSchemaDiagnostics(
                        validation.correctedDefinition.outputSchema,
                        workflowOutputSchema,
                    ),
                });
                continue;
            }

            if (next.value.gaveUp) {
                logWorkflowAttempts(
                    scenarioName,
                    attempts,
                    generationDiagnostics,
                    Date.now() - generationStartedAt,
                );
            }
            return next.value;
        }
    } catch (error) {
        logWorkflowAttempts(
            scenarioName,
            attempts,
            generationDiagnostics,
            Date.now() - generationStartedAt,
        );
        throw error;
    } finally {
        await stream.return(undefined as never);
    }
}

function logWorkflowAttempts(
    scenarioName: string,
    attempts: GenerationAttempt[],
    generationDiagnostics: WorkflowGenerationDiagnosticEvent[],
    elapsedMs: number,
) {
    console.error(
        `[workflow generation failed] ${scenarioName}: ${attempts.length} unsuccessful attempt(s)\n${JSON.stringify(
            { elapsedMs, attempts, generationDiagnostics },
            null,
            2,
        )}`,
    );
}

function logAcceptedWorkflow(
    scenarioName: string,
    executionCaseName: string,
    workflowDefinition: WorkflowDefinition,
) {
    console.error(
        `[workflow execution failed] ${scenarioName} / ${executionCaseName}\n${JSON.stringify(workflowDefinition, null, 2)}`,
    );
}

function defineScenario<TConfig, TCalls>(
    scenario: GenerationScenario<TConfig, TCalls>,
) {
    describe(scenario.name, () => {
        let generationPromise: Promise<WorkflowDefinition> | undefined;
        let scenarioStartedAt: number | undefined;
        let generationQueueMs: number | undefined;
        let generationMs: number | undefined;
        let executionStartedAt: number | undefined;
        let executionFinishedAt: number | undefined;
        let completedCases = 0;
        let timingLogged = false;

        const logScenarioTiming = () => {
            if (timingLogged || scenarioStartedAt === undefined) return;
            timingLogged = true;
            const now = performance.now();
            console.log(
                `[workflow scenario timing] ${scenario.name}: ${JSON.stringify({
                    generationQueueMs:
                        generationQueueMs === undefined
                            ? null
                            : Math.round(generationQueueMs),
                    generationMs:
                        generationMs === undefined
                            ? null
                            : Math.round(generationMs),
                    executionMs:
                        executionStartedAt === undefined ||
                        executionFinishedAt === undefined
                            ? 0
                            : Math.round(
                                  executionFinishedAt - executionStartedAt,
                              ),
                    totalMs: Math.round(now - scenarioStartedAt),
                })}`,
            );
        };

        const getWorkflowDefinition = (): Promise<WorkflowDefinition> => {
            if (generationPromise) return generationPromise;

            scenarioStartedAt = performance.now();
            const generationQueuedAt = performance.now();
            generationPromise = withGenerationSlot(async () => {
                generationQueueMs = performance.now() - generationQueuedAt;
                const generationStartedAt = performance.now();
                try {
                    const generationTools = scenario.createTools(
                        scenario.cases[0]?.config as TConfig,
                    ).tools;
                    const result = await collectGenerationOutput(
                        scenario.name,
                        scenario.taskDescription,
                        scenario.outputSchema,
                        generationTools,
                    );

                    if (result.gaveUp) {
                        throw new Error(
                            `Workflow generation gave up for "${scenario.name}": ${result.reason}`,
                        );
                    }
                    return result.workflowDefinition;
                } finally {
                    generationMs = performance.now() - generationStartedAt;
                }
            });

            return generationPromise;
        };

        for (const executionCase of scenario.cases) {
            test.concurrent(
                executionCase.name,
                async () => {
                    let workflowDefinition: WorkflowDefinition | undefined;
                    let executionCaseStartedAt: number | undefined;
                    try {
                        workflowDefinition = await getWorkflowDefinition();
                        executionCaseStartedAt = performance.now();
                        executionStartedAt = Math.min(
                            executionStartedAt ?? executionCaseStartedAt,
                            executionCaseStartedAt,
                        );
                        const fixture = scenario.createTools(
                            executionCase.config,
                        );
                        const result = await executeWorkflow({
                            workflowDefinition,
                            tools: fixture.tools,
                            model,
                            executionOptions: {
                                silenceLogs: true,
                                settings: {
                                    duration: { minPollIntervalSeconds: 0 },
                                    stepRetry: { retryDelaySeconds: 0 },
                                },
                            },
                        });

                        if (result.status === "error") {
                            throw new Error(
                                `Workflow execution failed for "${scenario.name}" / "${executionCase.name}": ${JSON.stringify(result.error)}`,
                            );
                        }
                        expect(result.output).toEqual(
                            executionCase.expectedOutput,
                        );
                        executionCase.assertCalls?.(fixture.calls);
                    } catch (error) {
                        if (workflowDefinition) {
                            logAcceptedWorkflow(
                                scenario.name,
                                executionCase.name,
                                workflowDefinition,
                            );
                        }
                        throw error;
                    } finally {
                        if (executionCaseStartedAt !== undefined) {
                            executionFinishedAt = Math.max(
                                executionFinishedAt ?? 0,
                                performance.now(),
                            );
                        }
                        completedCases += 1;
                        if (completedCases === scenario.cases.length) {
                            logScenarioTiming();
                        }
                    }
                },
                SCENARIO_TEST_TIMEOUT_MS,
            );
        }
    });
}

const customerSummarySchema: JSONSchema7 = {
    type: "object",
    properties: {
        customerId: { type: "string" },
        name: { type: "string" },
        tier: { type: "string", enum: ["gold", "silver", "bronze"] },
        balance: {
            type: "object",
            properties: {
                amount: { type: "number" },
                currency: { type: "string" },
            },
            required: ["amount", "currency"],
            additionalProperties: false,
        },
    },
    required: ["customerId", "name", "tier", "balance"],
    additionalProperties: false,
};

const customerScenario: GenerationScenario<undefined, undefined> = {
    name: "customer enrichment",
    taskDescription: `Fetch customer C-42 with get-customer, then fetch that customer's balance with get-account-balance. Return exactly one object containing customerId, name, tier, and a nested balance object containing amount and currency. Use the values returned by the tools and do not ask for user input.`,
    outputSchema: customerSummarySchema,
    createTools: () => ({
        calls: undefined,
        tools: {
            "get-customer": {
                description: "Fetch a customer by customerId.",
                inputSchema: type({ customerId: "string" }),
                outputSchema: type({
                    customerId: "string",
                    name: "string",
                    tier: "'gold'|'silver'|'bronze'",
                }),
                execute: ({ customerId }) => ({
                    customerId,
                    name: "Ada Lovelace",
                    tier: "gold",
                }),
            },
            "get-account-balance": {
                description: "Fetch the account balance for a customer.",
                inputSchema: type({ customerId: "string" }),
                outputSchema: type({
                    customerId: "string",
                    amount: "number",
                    currency: "string",
                }),
                execute: ({ customerId }) => ({
                    customerId,
                    amount: 125,
                    currency: "USD",
                }),
            },
        },
    }),
    cases: [
        {
            name: "combines both tool results",
            config: undefined,
            expectedOutput: {
                customerId: "C-42",
                name: "Ada Lovelace",
                tier: "gold",
                balance: { amount: 125, currency: "USD" },
            },
        },
    ],
};

type ReleaseCalls = { actions: string[] };

const releaseScenario: GenerationScenario<boolean, ReleaseCalls> = {
    name: "release readiness",
    taskDescription: `Get readiness for release 2026.08. If ready is true, call deploy-release; otherwise call hold-release. Return exactly the selected action tool's result and never call both action tools.`,
    outputSchema: {
        type: "object",
        properties: {
            releaseId: { type: "string" },
            decision: { type: "string", enum: ["deployed", "held"] },
        },
        required: ["releaseId", "decision"],
        additionalProperties: false,
    },
    createTools: (ready) => {
        const calls: ReleaseCalls = { actions: [] };
        return {
            calls,
            tools: {
                "get-release-readiness": {
                    description:
                        "Return whether the specified release is ready to deploy.",
                    inputSchema: type({ releaseId: "string" }),
                    outputSchema: type({
                        releaseId: "string",
                        ready: "boolean",
                    }),
                    execute: ({ releaseId }) => ({ releaseId, ready }),
                },
                "deploy-release": {
                    description: "Deploy a ready release.",
                    inputSchema: type({ releaseId: "string" }),
                    outputSchema: type({
                        releaseId: "string",
                        decision: "'deployed'",
                    }),
                    execute: ({ releaseId }) => {
                        calls.actions.push("deploy-release");
                        return { releaseId, decision: "deployed" };
                    },
                },
                "hold-release": {
                    description: "Hold a release that is not ready.",
                    inputSchema: type({ releaseId: "string" }),
                    outputSchema: type({
                        releaseId: "string",
                        decision: "'held'",
                    }),
                    execute: ({ releaseId }) => {
                        calls.actions.push("hold-release");
                        return { releaseId, decision: "held" };
                    },
                },
            },
        };
    },
    cases: [
        {
            name: "deploys a ready release",
            config: true,
            expectedOutput: { releaseId: "2026.08", decision: "deployed" },
            assertCalls: ({ actions }) => {
                expect(actions).toEqual(["deploy-release"]);
            },
        },
        {
            name: "holds a blocked release",
            config: false,
            expectedOutput: { releaseId: "2026.08", decision: "held" },
            assertCalls: ({ actions }) => {
                expect(actions).toEqual(["hold-release"]);
            },
        },
    ],
};

type InventoryConfig = { primary: boolean; backup: boolean };
type InventoryCalls = { checks: string[]; actions: string[] };

const inventoryScenario: GenerationScenario<InventoryConfig, InventoryCalls> = {
    name: "inventory fallback",
    taskDescription: `Fulfill SKU-9. First call check-inventory for warehouse primary. If it is available, reserve it there and stop checking. Otherwise check warehouse backup. If backup is available, reserve it there. If neither warehouse is available, call backorder-item. Return exactly the selected action tool's result.`,
    outputSchema: {
        type: "object",
        properties: {
            sku: { type: "string" },
            outcome: {
                type: "string",
                enum: ["reserved", "backordered"],
            },
            warehouse: {
                type: "string",
                enum: ["primary", "backup", "none"],
            },
        },
        required: ["sku", "outcome", "warehouse"],
        additionalProperties: false,
    },
    createTools: (availability) => {
        const calls: InventoryCalls = { checks: [], actions: [] };
        return {
            calls,
            tools: {
                "check-inventory": {
                    description:
                        "Check whether a SKU is available in a named warehouse.",
                    inputSchema: type({ sku: "string", warehouse: "string" }),
                    outputSchema: type({ available: "boolean" }),
                    execute: ({ warehouse }) => {
                        calls.checks.push(warehouse);
                        return {
                            available:
                                warehouse === "primary"
                                    ? availability.primary
                                    : availability.backup,
                        };
                    },
                },
                "reserve-inventory": {
                    description: "Reserve a SKU in an available warehouse.",
                    inputSchema: type({ sku: "string", warehouse: "string" }),
                    outputSchema: type({
                        sku: "string",
                        outcome: "'reserved'",
                        warehouse: "'primary'|'backup'",
                    }),
                    execute: ({ sku, warehouse }) => {
                        calls.actions.push(`reserve:${warehouse}`);
                        return { sku, outcome: "reserved", warehouse };
                    },
                },
                "backorder-item": {
                    description:
                        "Backorder a SKU when no warehouse has inventory.",
                    inputSchema: type({ sku: "string" }),
                    outputSchema: type({
                        sku: "string",
                        outcome: "'backordered'",
                        warehouse: "'none'",
                    }),
                    execute: ({ sku }) => {
                        calls.actions.push("backorder-item");
                        return {
                            sku,
                            outcome: "backordered",
                            warehouse: "none",
                        };
                    },
                },
            },
        };
    },
    cases: [
        {
            name: "reserves from primary without checking backup",
            config: { primary: true, backup: true },
            expectedOutput: {
                sku: "SKU-9",
                outcome: "reserved",
                warehouse: "primary",
            },
            assertCalls: ({ checks, actions }) => {
                expect(checks).toEqual(["primary"]);
                expect(actions).toEqual(["reserve:primary"]);
            },
        },
        {
            name: "falls back to backup",
            config: { primary: false, backup: true },
            expectedOutput: {
                sku: "SKU-9",
                outcome: "reserved",
                warehouse: "backup",
            },
            assertCalls: ({ checks, actions }) => {
                expect(checks).toEqual(["primary", "backup"]);
                expect(actions).toEqual(["reserve:backup"]);
            },
        },
        {
            name: "backorders when neither warehouse has inventory",
            config: { primary: false, backup: false },
            expectedOutput: {
                sku: "SKU-9",
                outcome: "backordered",
                warehouse: "none",
            },
            assertCalls: ({ checks, actions }) => {
                expect(checks).toEqual(["primary", "backup"]);
                expect(actions).toEqual(["backorder-item"]);
            },
        },
    ],
};

type Job = { jobId: string; ready: boolean };
type JobCalls = { runs: string[]; deferrals: string[] };

const jobScenario: GenerationScenario<Job[], JobCalls> = {
    name: "batch job routing",
    taskDescription: `Call list-jobs and process every returned job in the listed order. For each job, call run-job when ready is true and defer-job otherwise. Return an ordered array containing exactly each selected action tool's result. Return an empty array when there are no jobs.`,
    outputSchema: {
        type: "array",
        items: {
            type: "object",
            properties: {
                jobId: { type: "string" },
                status: { type: "string", enum: ["ran", "deferred"] },
            },
            required: ["jobId", "status"],
            additionalProperties: false,
        },
    },
    createTools: (jobs) => {
        const calls: JobCalls = { runs: [], deferrals: [] };
        return {
            calls,
            tools: {
                "list-jobs": {
                    description:
                        "List queued jobs in the order they must be processed.",
                    inputSchema: type({}),
                    outputSchema: type({
                        jobs: [{ jobId: "string", ready: "boolean" }, "[]"],
                    }),
                    execute: () => ({ jobs }),
                },
                "run-job": {
                    description: "Run a ready job.",
                    inputSchema: type({ jobId: "string" }),
                    outputSchema: type({
                        jobId: "string",
                        status: "'ran'",
                    }),
                    execute: ({ jobId }) => {
                        calls.runs.push(jobId);
                        return { jobId, status: "ran" };
                    },
                },
                "defer-job": {
                    description: "Defer a job that is not ready.",
                    inputSchema: type({ jobId: "string" }),
                    outputSchema: type({
                        jobId: "string",
                        status: "'deferred'",
                    }),
                    execute: ({ jobId }) => {
                        calls.deferrals.push(jobId);
                        return { jobId, status: "deferred" };
                    },
                },
            },
        };
    },
    cases: [
        {
            name: "returns an empty result for an empty queue",
            config: [],
            expectedOutput: [],
            assertCalls: ({ runs, deferrals }) => {
                expect(runs).toEqual([]);
                expect(deferrals).toEqual([]);
            },
        },
        {
            name: "runs every ready job",
            config: [
                { jobId: "JOB-1", ready: true },
                { jobId: "JOB-2", ready: true },
            ],
            expectedOutput: [
                { jobId: "JOB-1", status: "ran" },
                { jobId: "JOB-2", status: "ran" },
            ],
            assertCalls: ({ runs, deferrals }) => {
                expect(runs).toEqual(["JOB-1", "JOB-2"]);
                expect(deferrals).toEqual([]);
            },
        },
        {
            name: "defers every blocked job",
            config: [
                { jobId: "JOB-3", ready: false },
                { jobId: "JOB-4", ready: false },
            ],
            expectedOutput: [
                { jobId: "JOB-3", status: "deferred" },
                { jobId: "JOB-4", status: "deferred" },
            ],
            assertCalls: ({ runs, deferrals }) => {
                expect(runs).toEqual([]);
                expect(deferrals).toEqual(["JOB-3", "JOB-4"]);
            },
        },
        {
            name: "preserves order for mixed routing",
            config: [
                { jobId: "JOB-5", ready: true },
                { jobId: "JOB-6", ready: false },
                { jobId: "JOB-7", ready: true },
            ],
            expectedOutput: [
                { jobId: "JOB-5", status: "ran" },
                { jobId: "JOB-6", status: "deferred" },
                { jobId: "JOB-7", status: "ran" },
            ],
            assertCalls: ({ runs, deferrals }) => {
                expect(runs).toEqual(["JOB-5", "JOB-7"]);
                expect(deferrals).toEqual(["JOB-6"]);
            },
        },
    ],
};

type IncidentConfig = { incidentId: string; report: string };
type IncidentCalls = { routes: string[] };

const incidentScenario: GenerationScenario<IncidentConfig, IncidentCalls> = {
    name: "semantic incident routing",
    taskDescription: `Fetch incident INC-77 with get-incident. Treat it as an emergency only when the report says the production service is completely unavailable or says there is active data loss. For an emergency call page-on-call; for every other report, including cosmetic issues with no functional impact, call queue-review. Return exactly the selected routing tool's result.`,
    outputSchema: {
        type: "object",
        properties: {
            incidentId: { type: "string" },
            route: { type: "string", enum: ["on-call", "review"] },
        },
        required: ["incidentId", "route"],
        additionalProperties: false,
    },
    createTools: (incident) => {
        const calls: IncidentCalls = { routes: [] };
        return {
            calls,
            tools: {
                "get-incident": {
                    description: "Fetch an incident report by incidentId.",
                    inputSchema: type({ incidentId: "string" }),
                    outputSchema: type({
                        incidentId: "string",
                        report: "string",
                    }),
                    execute: () => incident,
                },
                "page-on-call": {
                    description: "Page the on-call engineer for an emergency.",
                    inputSchema: type({ incidentId: "string" }),
                    outputSchema: type({
                        incidentId: "string",
                        route: "'on-call'",
                    }),
                    execute: ({ incidentId }) => {
                        calls.routes.push("page-on-call");
                        return { incidentId, route: "on-call" };
                    },
                },
                "queue-review": {
                    description:
                        "Queue a non-emergency incident for normal review.",
                    inputSchema: type({ incidentId: "string" }),
                    outputSchema: type({
                        incidentId: "string",
                        route: "'review'",
                    }),
                    execute: ({ incidentId }) => {
                        calls.routes.push("queue-review");
                        return { incidentId, route: "review" };
                    },
                },
            },
        };
    },
    cases: [
        {
            name: "pages on-call for a complete production outage",
            config: {
                incidentId: "INC-77",
                report: "The production payments service is completely unavailable. Every request is failing and customers cannot check out.",
            },
            expectedOutput: { incidentId: "INC-77", route: "on-call" },
            assertCalls: ({ routes }) => {
                expect(routes).toEqual(["page-on-call"]);
            },
        },
        {
            name: "queues a cosmetic issue for normal review",
            config: {
                incidentId: "INC-77",
                report: "The weekly dashboard uses the wrong shade of blue. There is no functional impact and all production services are healthy.",
            },
            expectedOutput: { incidentId: "INC-77", route: "review" },
            assertCalls: ({ routes }) => {
                expect(routes).toEqual(["queue-review"]);
            },
        },
    ],
};

describeLive("workflow generation and execution", () => {
    defineScenario(customerScenario);
    defineScenario(releaseScenario);
    defineScenario(inventoryScenario);
    defineScenario(jobScenario);
    defineScenario(incidentScenario);
});

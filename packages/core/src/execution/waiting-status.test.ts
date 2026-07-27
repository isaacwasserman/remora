import { describe, expect, test } from "bun:test";
import { tool } from "ai";
import { type } from "arktype";
import type { WorkflowDefinition, WorkflowStep } from "../schema";
import type { ToolSet } from "../types";
import { executeWorkflowStream } from "./execute-workflow";
import { createInMemoryExecutionEngine } from "./execution-engine/in-memory";
import { createMockModel } from "./test-support";
import type { ExecutionState } from "./types";
import type { UserInterventionAdapter } from "./user-intervention/types";

/**
 * A blocked run has to be distinguishable from a hung one, so the statuses below
 * are asserted against what `executeWorkflowStream` actually emits — not just
 * against the type union.
 */

/** A tool set whose `probe` tool reports ready only from its second call on. */
function createProbeTools(): ToolSet {
    let calls = 0;
    return {
        probe: tool({
            description: "ready on the second call",
            inputSchema: type({}),
            outputSchema: type({ ready: "boolean" }),
            execute: () => ({ ready: ++calls >= 2 }),
        }),
    };
}

async function statusesOf(
    workflowDefinition: WorkflowDefinition,
    options: {
        tools?: ToolSet;
        userInterventionAdapter?: UserInterventionAdapter;
        onStatus?: (status: ExecutionState["status"]) => void;
    } = {},
) {
    const statuses: ExecutionState["status"][] = [];
    const scopes: ExecutionState["scope"][] = [];
    let last: ExecutionState | undefined;
    for await (const state of executeWorkflowStream({
        workflowDefinition,
        agentConfig: {
            tools: options.tools ?? {},
            model: createMockModel([]),
        },
        executionOptions: {
            silenceLogs: true,
            executionEngine: createInMemoryExecutionEngine(),
            // Spread conditionally: an explicit `undefined` would override the
            // executor's default adapter instead of leaving it in place.
            ...(options.userInterventionAdapter && {
                userInterventionAdapter: options.userInterventionAdapter,
            }),
        },
        procedureId: "waiting",
        runId: "run",
    })) {
        statuses.push(state.status);
        scopes.push(state.scope);
        options.onStatus?.(state.status);
        last = state;
    }
    return { statuses, scopes, last };
}

describe("waiting statuses", () => {
    test("a sleep step reports `sleeping` while it serves its delay", async () => {
        const workflow: WorkflowDefinition = {
            initialStepId: "nap",
            steps: [
                {
                    id: "nap",
                    name: "nap",
                    description: "nap",
                    type: "sleep",
                    nextStepId: "fin",
                    params: { durationMs: { type: "literal", value: 1 } },
                },
                {
                    id: "fin",
                    name: "fin",
                    description: "fin",
                    type: "end",
                    params: { output: { type: "literal", value: "awake" } },
                },
            ],
        };

        const { statuses, last } = await statusesOf(workflow);
        expect(last?.status).toBe("success");
        expect(statuses).toContain("sleeping");
    });

    test("a wait-for-condition step reports `awaiting-condition` while polling", async () => {
        const workflow: WorkflowDefinition = {
            initialStepId: "wait",
            steps: [
                {
                    id: "wait",
                    name: "wait",
                    description: "wait",
                    type: "wait-for-condition",
                    nextStepId: "fin",
                    params: {
                        conditionStepId: "check",
                        condition: {
                            type: "jmespath",
                            expression: "check.ready",
                        },
                        intervalMs: { type: "literal", value: 1 },
                        maxAttempts: { type: "literal", value: 5 },
                    },
                },
                {
                    id: "check",
                    name: "check",
                    description: "check",
                    type: "tool-call",
                    params: { toolName: "probe", toolInput: {} },
                },
                {
                    id: "fin",
                    name: "fin",
                    description: "fin",
                    type: "end",
                    params: { output: { type: "literal", value: "done" } },
                },
            ],
        };

        const { statuses, last } = await statusesOf(workflow, {
            tools: createProbeTools(),
        });
        expect(last?.status).toBe("success");
        expect(statuses).toContain("awaiting-condition");
    });

    test("an request-intervention step reports `awaiting-input` only after the question is sent", async () => {
        // One ordered timeline of adapter calls and status emissions, so an
        // `awaiting-input` announced before the question was actually sent —
        // telling a host to expect an answer nobody was asked for — fails here.
        const events: string[] = [];
        const adapter: UserInterventionAdapter = {
            requestIntervention: async () => {
                events.push("requestIntervention");
            },
            getResponse: async () => {
                events.push("getResponse");
                return { answer: "yes" };
            },
        };

        const workflow: WorkflowDefinition = {
            initialStepId: "ask",
            steps: [
                {
                    id: "ask",
                    name: "ask",
                    description: "ask",
                    type: "request-intervention",
                    nextStepId: "fin",
                    params: {
                        type: "multiple-choice",
                        question: { type: "literal", value: "Ship it?" },
                        choices: { type: "literal", value: ["yes", "no"] },
                        allowFreeResponse: false,
                    },
                },
                {
                    id: "fin",
                    name: "fin",
                    description: "fin",
                    type: "end",
                    params: {
                        output: { type: "jmespath", expression: "ask" },
                    },
                },
            ],
        };

        const { statuses, last } = await statusesOf(workflow, {
            userInterventionAdapter: adapter,
            onStatus: (status) => {
                if (status === "awaiting-input") {
                    events.push("status:awaiting-input");
                }
            },
        });
        expect(last?.status).toBe("success");
        expect(last?.output).toBe("yes");
        expect(statuses).toContain("awaiting-input");
        expect(events).toEqual([
            "requestIntervention",
            "status:awaiting-input",
            "getResponse",
        ]);
    });

    test("updates from inside a condition chain are forwarded, not swallowed", async () => {
        // The chain runs inside `waitFor`'s poll callback, which is not a
        // generator; its updates have to be forwarded out of that boundary.
        const steps: WorkflowStep[] = [
            {
                id: "wait",
                name: "wait",
                description: "wait",
                type: "wait-for-condition",
                nextStepId: "fin",
                params: {
                    conditionStepId: "pause",
                    condition: { type: "jmespath", expression: "check.ready" },
                    intervalMs: { type: "literal", value: 1 },
                    maxAttempts: { type: "literal", value: 5 },
                },
            },
            // A sleep inside the chain, so the chain reports a status of its own
            // rather than just scope changes.
            {
                id: "pause",
                name: "pause",
                description: "pause",
                type: "sleep",
                nextStepId: "check",
                params: { durationMs: { type: "literal", value: 1 } },
            },
            {
                id: "check",
                name: "check",
                description: "check",
                type: "tool-call",
                params: { toolName: "probe", toolInput: {} },
            },
            {
                id: "fin",
                name: "fin",
                description: "fin",
                type: "end",
                params: { output: { type: "literal", value: "done" } },
            },
        ];

        const { statuses, scopes, last } = await statusesOf(
            { initialStepId: "wait", steps },
            { tools: createProbeTools() },
        );

        expect(last?.status).toBe("success");
        // The chain's `check` step output reached the stream.
        expect(scopes.some((scope) => scope.check !== undefined)).toBe(true);
        // ...as did the `sleeping` status raised from inside the chain.
        expect(statuses).toContain("sleeping");
        expect(statuses).toContain("awaiting-condition");
    });

    test("a run with nothing to wait on never reports a waiting status", async () => {
        const workflow: WorkflowDefinition = {
            initialStepId: "go",
            steps: [
                {
                    id: "go",
                    name: "go",
                    description: "go",
                    type: "start",
                    nextStepId: "fin",
                },
                {
                    id: "fin",
                    name: "fin",
                    description: "fin",
                    type: "end",
                    params: { output: { type: "literal", value: 1 } },
                },
            ],
        };

        const { statuses, last } = await statusesOf(workflow);
        expect(last?.status).toBe("success");
        expect(statuses.filter((status) => status !== "in-progress")).toEqual([
            "success",
        ]);
    });
});

import { describe, expect, test } from "bun:test";
import { tool } from "ai";
import { type } from "arktype";
import type { WorkflowDefinition } from "../schema";
import type { AgentConfig, RemoraflowSettings } from "../types";
import { step, workflow } from "../workflow-fixtures";
import { executeWorkflow } from ".";
import { createMockModel } from "./test-support";

function countingToolset() {
    const calls: unknown[] = [];
    const tools = {
        touch: tool({
            inputSchema: type({ item: "unknown" }),
            outputSchema: type({ ok: "boolean" }),
            execute: ({ item }: { item: unknown }) => {
                calls.push(item);
                return { ok: true };
            },
        }),
    };
    return { tools, calls };
}

/** A workflow that loops over `items`, calling `touch` once per element. */
function loopWorkflow(items: unknown[]): WorkflowDefinition {
    return workflow(
        step("loop", {
            type: "for-each",
            params: {
                target: { type: "literal", value: items },
                itemName: "item",
                loopBodyStepId: "body",
            },
        }),
        step("body", {
            type: "tool-call",
            params: {
                toolName: "touch",
                toolInput: { item: { type: "jmespath", expression: "item" } },
            },
        }),
    );
}

/**
 * An outer loop over one element whose body is an inner loop over `items`, so
 * the overage is raised beneath a `for-each` that is forwarding updates.
 */
function nestedLoopWorkflow(items: unknown[]): WorkflowDefinition {
    return workflow(
        step("outer", {
            type: "for-each",
            params: {
                target: { type: "literal", value: [0] },
                itemName: "outerItem",
                loopBodyStepId: "inner",
            },
        }),
        step("inner", {
            type: "for-each",
            params: {
                target: { type: "literal", value: items },
                itemName: "item",
                loopBodyStepId: "body",
            },
        }),
        step("body", {
            type: "tool-call",
            params: {
                toolName: "touch",
                toolInput: { item: { type: "jmespath", expression: "item" } },
            },
        }),
    );
}

function run(
    workflowDefinition: WorkflowDefinition,
    maxLoopIterations: number,
    tools: AgentConfig["tools"],
) {
    const policy: RemoraflowSettings = {
        structuralLimits: { maxLoopIterations },
    };
    return executeWorkflow({
        workflowDefinition,
        tools,
        model: createMockModel([]),
        executionOptions: { settings: policy, silenceLogs: true },
    });
}

describe("maxLoopIterations enforcement", () => {
    test("a for-each whose target overruns the limit fails the run", async () => {
        const { tools, calls } = countingToolset();

        const result = await run(loopWorkflow([1, 2, 3, 4]), 3, tools);

        expect(result.status).toBe("error");
        expect(result.error?.code).toBe("LOOP_ITERATION_LIMIT_EXCEEDED");
        expect(result.error?.message).toContain("4");
        expect(result.error?.message).toContain("3");
        // Points at the `for-each` step, so a viewer can mark the failing node.
        expect(result.error?.path).toEqual(["steps", 0]);
        // Rejected before the loop starts, so no iteration runs at all.
        expect(calls).toEqual([]);
    });

    test("a target exactly at the limit is allowed", async () => {
        const { tools, calls } = countingToolset();

        const result = await run(loopWorkflow([1, 2, 3]), 3, tools);

        expect(result.status).toBe("success");
        expect(calls).toEqual([1, 2, 3]);
    });

    test("a limit of 0 means unlimited", async () => {
        const { tools, calls } = countingToolset();

        const result = await run(loopWorkflow([1, 2, 3, 4, 5]), 0, tools);

        expect(result.status).toBe("success");
        expect(calls).toHaveLength(5);
    });

    test("an overage in a nested loop is not remapped by the enclosing loop", async () => {
        const { tools, calls } = countingToolset();

        const result = await run(nestedLoopWorkflow([1, 2]), 1, tools);

        expect(result.status).toBe("error");
        expect(result.error?.code).toBe("LOOP_ITERATION_LIMIT_EXCEEDED");
        expect(result.error?.message).toContain("inner");
        // The inner loop, not the outer one that forwarded the error.
        expect(result.error?.path).toEqual(["steps", 1]);
        expect(calls).toEqual([]);
    });
});

describe("maxLoopIterations enforcement (while)", () => {
    function whileRun(trueCount: number, maxLoopIterations: number) {
        let condCalls = 0;
        const bodyCalls: unknown[] = [];
        const check = tool({
            inputSchema: type({}),
            outputSchema: type({ go: "boolean" }),
            execute: () => ({ go: ++condCalls <= trueCount }),
        });
        const touch = tool({
            inputSchema: type({ item: "unknown" }),
            outputSchema: type({ ok: "boolean" }),
            execute: ({ item }: { item: unknown }) => {
                bodyCalls.push(item);
                return { ok: true };
            },
        });
        const wf = workflow(
            step("loop", {
                type: "while",
                params: {
                    conditionStepId: "cond",
                    loopBodyStepId: "body",
                },
            }),
            step("cond", {
                type: "tool-call",
                nextStepId: "condEnd",
                params: { toolName: "check", toolInput: {} },
            }),
            step("condEnd", {
                type: "end",
                params: {
                    output: { type: "jmespath", expression: "cond.go" },
                },
            }),
            step("body", {
                type: "tool-call",
                nextStepId: "bodyEnd",
                params: {
                    toolName: "touch",
                    toolInput: {
                        item: { type: "literal", value: true },
                    },
                },
            }),
            step("bodyEnd", {
                type: "end",
                params: {
                    output: { type: "jmespath", expression: "body.ok" },
                },
            }),
        );
        return {
            result: run(wf, maxLoopIterations, { check, touch }),
            bodyCalls,
        };
    }

    test("a while loop that exceeds the iteration limit fails the run", async () => {
        const { result, bodyCalls } = whileRun(10, 3);
        const r = await result;
        expect(r.status).toBe("error");
        expect(r.error?.code).toBe("LOOP_ITERATION_LIMIT_EXCEEDED");
        expect(r.error?.path).toEqual(["steps", 0]);
        expect(bodyCalls).toHaveLength(3);
    });

    test("a while loop exactly at the limit is allowed", async () => {
        const { result, bodyCalls } = whileRun(3, 3);
        const r = await result;
        expect(r.status).toBe("success");
        expect(bodyCalls).toHaveLength(3);
    });

    test("a limit of 0 means unlimited for while loops", async () => {
        const { result, bodyCalls } = whileRun(5, 0);
        const r = await result;
        expect(r.status).toBe("success");
        expect(bodyCalls).toHaveLength(5);
    });
});

import { describe, expect, test } from "bun:test";
import { remoraflowSettingsSchema } from "../types";
import { step, workflow } from "../workflow-fixtures";
import { createExecutionContext } from "./execution-engine/context";
import { createInMemoryExecutionEngine } from "./execution-engine/in-memory";
import { _executeWorkflow } from "./run-workflow";
import { createMockModel, testPolicies } from "./test-support";
import { defaultUserInterventionAdapter } from "./user-intervention/default-adapter";
import { createUserInverventionContext } from "./user-intervention/types";

async function collectErrors(
    wf: ReturnType<typeof workflow>,
    settings: ReturnType<typeof remoraflowSettingsSchema.assert>,
    model = createMockModel([]),
): Promise<{ code: string; message: string; path?: PropertyKey[] } | null> {
    const executionContext = createExecutionContext(
        createInMemoryExecutionEngine().createRun(),
        testPolicies(),
    );
    for await (const update of _executeWorkflow({
        workflowDefinition: wf,
        initialScope: {},
        tools: {},
        model,
        settings,
        approvalPolicies: [],
        executionContext,
        userInterventionContext: createUserInverventionContext(
            defaultUserInterventionAdapter,
        ),
        uniqueStepIdPath: [],
    })) {
        if (update.error) return update.error;
    }
    return null;
}

describe("feature-flag guard in _executeWorkflow (defense-in-depth)", () => {
    test("rejects an agent-loop step when allowAgentLoops is false", async () => {
        const settings = remoraflowSettingsSchema.assert({
            features: { allowAgentLoops: false },
        });
        const wf = workflow(
            step("begin", { type: "start", nextStepId: "agent" }),
            step("agent", {
                type: "agent-loop",
                params: {
                    instructions: "do it",
                    tools: [],
                    outputFormat: { type: "object" },
                },
            }),
        );
        const error = await collectErrors(wf, settings);
        expect(error?.code).toBe("INVALID_WORKFLOW");
        expect(error?.message).toContain("agent-loop");
    });

    test("rejects a request-intervention step when allowUserIntervention is false", async () => {
        const settings = remoraflowSettingsSchema.assert({
            features: { allowUserIntervention: false },
        });
        const wf = workflow(
            step("begin", { type: "start", nextStepId: "ask" }),
            step("ask", {
                type: "request-intervention",
                params: {
                    type: "multiple-choice",
                    question: { type: "literal", value: "Ship it?" },
                    choices: { type: "literal", value: ["yes", "no"] },
                    allowFreeResponse: false,
                },
            }),
        );
        const error = await collectErrors(wf, settings);
        expect(error?.code).toBe("INVALID_WORKFLOW");
        expect(error?.message).toContain("request-intervention");
    });

    test("allows an agent-loop step when allowAgentLoops is true", async () => {
        const settings = remoraflowSettingsSchema.assert({
            features: { allowAgentLoops: true },
        });
        const wf = workflow(
            step("begin", { type: "start", nextStepId: "agent" }),
            step("agent", {
                type: "agent-loop",
                params: {
                    instructions: "do it",
                    tools: [],
                    outputFormat: { type: "object" },
                },
            }),
        );
        const error = await collectErrors(
            wf,
            settings,
            createMockModel([{ ok: true }]),
        );
        expect(error).toBeNull();
    });
});

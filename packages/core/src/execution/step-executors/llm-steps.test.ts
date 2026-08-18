import { describe, expect, test } from "bun:test";
import { tool } from "ai";
import type { MockLanguageModelV3 } from "ai/test";
import { type } from "arktype";
import type { JSONSchema7 } from "json-schema";
import type { WorkflowStep } from "../../schema";
import { type AgentConfig, remoraflowSettingsSchema } from "../../types";
import { step, workflow } from "../../workflow-fixtures";
import { executeWorkflowStream } from "..";
import { createExecutionContext } from "../execution-engine/context";
import { createInMemoryExecutionEngine } from "../execution-engine/in-memory";
import { createMockModel, failingModel, testPolicies } from "../test-support";
import type { ExecutionState, StepExecutorOutput } from "../types";
import { defaultUserInterventionAdapter } from "../user-intervention/default-adapter";
import { createUserInverventionContext } from "../user-intervention/types";
import { stepExecutors } from ".";

const answerFormat: JSONSchema7 = {
    type: "object",
    properties: { answer: { type: "string" } },
    required: ["answer"],
};

const sourceText = "Ada Lovelace wrote the first algorithm in 1843.";

const docTool = tool({
    inputSchema: type({}),
    outputSchema: type({ text: "string" }),
    execute: () => ({ text: sourceText }),
});

/** Every prompt the model was sent, flattened for substring assertions. */
function recordedPrompts(model: MockLanguageModelV3): string {
    return JSON.stringify(model.doGenerateCalls.map((call) => call.prompt));
}

/** Names of the tools the model was offered on its first call. */
function recordedToolNames(model: MockLanguageModelV3): string[] {
    return (model.doGenerateCalls[0]?.tools ?? []).map(({ name }) => name);
}

async function runWorkflow(
    agentConfig: AgentConfig,
    ...steps: WorkflowStep[]
): Promise<ExecutionState> {
    let last: ExecutionState | undefined;
    for await (const state of executeWorkflowStream({
        workflowDefinition: workflow(...steps),
        tools: agentConfig.tools,
        model: agentConfig.model,
        executionOptions: { silenceLogs: true },
    })) {
        last = state;
    }
    if (!last) {
        throw new Error("executeWorkflowStream yielded no states");
    }
    return last;
}

describe("llm-prompt executor", () => {
    test("resolves template variables in the prompt against scope", async () => {
        const model = createMockModel([{ answer: "sentiment: positive" }]);

        const result = await runWorkflow(
            { model, tools: { fetchDoc: docTool } },
            step("begin", { type: "start", nextStepId: "fetch" }),
            step("fetch", {
                type: "tool-call",
                nextStepId: "ask",
                params: { toolName: "fetchDoc", toolInput: {} },
            }),
            step("ask", {
                type: "llm-prompt",
                nextStepId: "finish",
                params: {
                    prompt: "Summarize: ${fetch.text}",
                    outputFormat: answerFormat,
                },
            }),
            step("finish", { type: "end" }),
        );

        expect(result.error).toBeNull();
        expect(recordedPrompts(model)).toContain(sourceText);
    });

    test("wraps a model failure as LLM_RUN_FAILED", async () => {
        const result = await runWorkflow(
            { model: failingModel("model down"), tools: {} },
            step("begin", { type: "start", nextStepId: "ask" }),
            step("ask", {
                type: "llm-prompt",
                nextStepId: "finish",
                params: { prompt: "hi", outputFormat: answerFormat },
            }),
            step("finish", { type: "end" }),
        );

        expect(result.error?.code).toBe("LLM_RUN_FAILED");
        expect(result.error?.message).toContain("model down");
    });
});

describe("agent-loop executor", () => {
    test("resolves template variables in instructions against scope", async () => {
        const model = createMockModel([{ answer: "done" }]);

        const result = await runWorkflow(
            { model, tools: { fetchDoc: docTool } },
            step("begin", { type: "start", nextStepId: "fetch" }),
            step("fetch", {
                type: "tool-call",
                nextStepId: "agent",
                params: { toolName: "fetchDoc", toolInput: {} },
            }),
            step("agent", {
                type: "agent-loop",
                nextStepId: "finish",
                params: {
                    instructions: "Process: ${fetch.text}",
                    tools: ["fetchDoc"],
                    outputFormat: answerFormat,
                },
            }),
            step("finish", { type: "end" }),
        );

        expect(result.error).toBeNull();
        expect(recordedPrompts(model)).toContain(sourceText);
    });

    test("resolves tools and stores the model's output", async () => {
        const model = createMockModel([{ answer: "done" }]);

        const result = await runWorkflow(
            { model, tools: { known: docTool, unlisted: docTool } },
            step("begin", { type: "start", nextStepId: "agent" }),
            step("agent", {
                type: "agent-loop",
                nextStepId: "finish",
                params: {
                    instructions: "do it",
                    tools: ["known"],
                    outputFormat: answerFormat,
                },
            }),
            step("finish", { type: "end" }),
        );

        expect(result.error).toBeNull();
        expect(result.scope.agent).toEqual({ answer: "done" });
        // Exactly the step's listed tools reached the model — no more, no less.
        expect(recordedToolNames(model)).toEqual(["known"]);
    });

    test("errors AGENT_RUN_FAILED when a referenced tool is missing", async () => {
        const update = await runAgentLoopStep(
            {
                id: "agent",
                name: "agent",
                description: "",
                type: "agent-loop",
                params: {
                    instructions: "do it",
                    tools: ["ghost"],
                    outputFormat: answerFormat,
                },
            },
            { model: createMockModel([{ answer: "done" }]), tools: {} },
        );

        expect(update?.error?.code).toBe("AGENT_RUN_FAILED");
        expect(update?.error?.message).toContain("ghost");
    });
});

describe("extract-data executor", () => {
    test("extracts structured data from the source and stores it", async () => {
        const model = createMockModel([{ answer: "extracted" }]);

        const result = await runWorkflow(
            { model, tools: { fetchDoc: docTool } },
            step("begin", { type: "start", nextStepId: "fetch" }),
            step("fetch", {
                type: "tool-call",
                nextStepId: "extract",
                params: { toolName: "fetchDoc", toolInput: {} },
            }),
            step("extract", {
                type: "extract-data",
                nextStepId: "finish",
                params: {
                    sourceData: { type: "jmespath", expression: "fetch.text" },
                    outputFormat: answerFormat,
                },
            }),
            step("finish", { type: "end" }),
        );

        expect(result.error).toBeNull();
        expect(result.scope.extract).toEqual({ answer: "extracted" });
        // The resolved source data, not just the output format, reached the model.
        expect(recordedPrompts(model)).toContain(sourceText);
    });
});

/**
 * Validation rejects an agent-loop that lists an unknown tool before execution
 * starts, so the executor's own AGENT_RUN_FAILED path is only reachable by
 * invoking the step executor directly.
 */
async function runAgentLoopStep(
    agentStep: Extract<WorkflowStep, { type: "agent-loop" }>,
    agentConfig: AgentConfig,
): Promise<StepExecutorOutput | undefined> {
    const executor = stepExecutors["agent-loop"];
    let last: StepExecutorOutput | undefined;
    try {
        for await (const update of executor.execute({
            uniqueStepIdPath: [agentStep.id],
            step: agentStep,
            scope: {},
            workflowDefinition: workflow(agentStep),
            tools: agentConfig.tools,
            model: agentConfig.model,
            settings: remoraflowSettingsSchema.assert({}),
            approvalPolicies: [],
            executionContext: createExecutionContext(
                createInMemoryExecutionEngine().createRun("run"),
                testPolicies(),
            ),
            userInterventionContext: createUserInverventionContext(
                defaultUserInterventionAdapter,
            ),
        })) {
            last = update;
        }
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
            scope: null,
            output: null,
            error: { code: executor.errorCode, message },
            currentUniqueStepIdPath: [agentStep.id],
        };
    }
    return last;
}

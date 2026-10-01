import { describe, expect, test } from "bun:test";
import { type } from "arktype";
import { createWorkflowDefinitionSchema } from "./schema";
import { step } from "./workflow-fixtures";

describe("createWorkflowDefinitionSchema cache", () => {
    test("reuses schemas for identical raw settings", () => {
        const defaults = createWorkflowDefinitionSchema();
        expect(createWorkflowDefinitionSchema({})).toBe(defaults);

        const custom = createWorkflowDefinitionSchema({
            tokenBudgets: { maxAgentSteps: 2 },
        });
        expect(
            createWorkflowDefinitionSchema({
                tokenBudgets: { maxAgentSteps: 2 },
            }),
        ).toBe(custom);
    });

    test("builds a new schema when a setting changes its constraints", () => {
        const defaults = createWorkflowDefinitionSchema();
        const restrictedSettings = {
            tokenBudgets: { maxAgentSteps: 2 },
        };
        const restricted = createWorkflowDefinitionSchema(restrictedSettings);

        expect(restricted).not.toBe(defaults);

        const agentStep = step("agent", {
            type: "agent-loop",
            params: {
                instructions: "do it",
                tools: [],
                outputFormat: { type: "object" },
                maxSteps: { type: "literal", value: 3 },
            },
        });
        expect(
            defaults.workflowStepArktypeSchema(agentStep) instanceof
                type.errors,
        ).toBe(false);
        expect(
            restricted.workflowStepArktypeSchema(agentStep) instanceof
                type.errors,
        ).toBe(true);
    });
});

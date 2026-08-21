import { describe, expect, test } from "bun:test";
import type { WorkflowStep } from "@remoraflow/core";
import { renderStepParams } from "./rendered-params";

describe("renderStepParams", () => {
    test("renders prompt and instruction templates from the execution scope", () => {
        const scope = { pokemon: { name: "Pikachu" }, format: "Singles" };
        const promptStep: WorkflowStep = {
            id: "prompt",
            name: "Prompt",
            description: "",
            type: "llm-prompt",
            params: {
                prompt: "Analyze ${pokemon.name} for ${format}.",
                outputFormat: { type: "object" },
            },
        };
        const agentStep: WorkflowStep = {
            id: "agent",
            name: "Agent",
            description: "",
            type: "agent-loop",
            params: {
                instructions: "Build a ${format} team for ${pokemon.name}.",
                tools: [],
                outputFormat: { type: "object" },
            },
        };

        expect(renderStepParams(promptStep, scope)?.prompt).toBe(
            "Analyze Pikachu for Singles.",
        );
        expect(renderStepParams(agentStep, scope)?.instructions).toBe(
            "Build a Singles team for Pikachu.",
        );
    });

    test("renders expression-based inputs without mutating the workflow", () => {
        const step: WorkflowStep = {
            id: "extract",
            name: "Extract",
            description: "",
            type: "extract-data",
            params: {
                sourceData: { type: "jmespath", expression: "result.text" },
                outputFormat: { type: "object" },
            },
        };

        expect(renderStepParams(step, { result: { text: "source" } })).toEqual({
            sourceData: "source",
            outputFormat: { type: "object" },
        });
        expect(step.params.sourceData).toEqual({
            type: "jmespath",
            expression: "result.text",
        });
    });
});

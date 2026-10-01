import { describe, expect, test } from "bun:test";
import type { WorkflowDefinition } from "@remoraflow/core";
import { deriveDataDependencies } from "./data-dependencies";

const workflow: WorkflowDefinition = {
    initialStepId: "fetch",
    steps: [
        {
            id: "fetch",
            name: "Fetch",
            description: "",
            type: "tool-call",
            params: {
                toolName: "get",
                toolInput: {
                    id: { type: "jmespath", expression: "input.id" },
                },
            },
            nextStepId: "summarize",
        },
        {
            id: "summarize",
            name: "Summarize",
            description: "",
            type: "llm-prompt",
            params: {
                prompt: "Summarize ${fetch.body} and ${fetch.title}.",
                outputFormat: { type: "string" },
            },
            nextStepId: "done",
        },
        {
            id: "done",
            name: "Done",
            description: "",
            type: "end",
            params: {
                output: {
                    type: "jmespath",
                    expression:
                        "{ summary: summarize, tags: fetch.items[*].summarize }",
                },
            },
        },
    ],
};

describe("deriveDataDependencies", () => {
    test("links each step to the steps its expressions read from the root", () => {
        expect(deriveDataDependencies(workflow)).toEqual([
            { sourceStepId: "fetch", targetStepId: "summarize" },
            { sourceStepId: "summarize", targetStepId: "done" },
            { sourceStepId: "fetch", targetStepId: "done" },
        ]);
    });

    test("ignores reads of workflow input and of names that are not steps", () => {
        expect(
            deriveDataDependencies({
                ...workflow,
                steps: workflow.steps.filter((step) => step.id !== "fetch"),
            }),
        ).toEqual([{ sourceStepId: "summarize", targetStepId: "done" }]);
    });
});

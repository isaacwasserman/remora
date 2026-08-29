import { describe, expect, it } from "bun:test";
import { tool } from "ai";
import { type } from "arktype";
import type { ToolSet } from "../types";
import { step, workflow } from "../workflow-fixtures";
import { auditWorkflow } from "./index";

const testTools: ToolSet = {
    "test-tool": tool({
        inputSchema: type({ name: "string", count: "number" }),
        execute: async () => 1,
    }),
    "other-tool": tool({
        inputSchema: type({ query: "string" }),
        execute: async () => 1,
    }),
};

describe("auditWorkflow provenance", () => {
    it("returns a single tool-call source with the step id", () => {
        const wf = workflow(
            step("start", { type: "start", nextStepId: "call" }),
            step("call", {
                type: "tool-call",
                params: {
                    toolName: "test-tool",
                    toolInput: {
                        name: { type: "literal", value: "hello" },
                        count: { type: "literal", value: 5 },
                    },
                },
                nextStepId: "end",
            }),
            step("end", { type: "end" }),
        );

        const result = auditWorkflow(wf, testTools);
        const entry = result.capabilities.toolCalls.find(
            (tc) => tc.toolName === "test-tool",
        );
        expect(entry).toBeDefined();
        expect(entry?.sources).toHaveLength(1);
        expect(entry?.sources[0]?.provenance).toBe("tool-call");
        expect(entry?.sources[0]?.stepIds).toEqual(["call"]);
    });

    it("returns a single agent-loop source with the step id", () => {
        const wf = workflow(
            step("start", { type: "start", nextStepId: "agent" }),
            step("agent", {
                type: "agent-loop",
                params: {
                    instructions: "do things",
                    tools: ["test-tool"],
                    outputFormat: { type: "object" },
                },
                nextStepId: "end",
            }),
            step("end", { type: "end" }),
        );

        const result = auditWorkflow(wf, testTools);
        const entry = result.capabilities.toolCalls.find(
            (tc) => tc.toolName === "test-tool",
        );
        expect(entry).toBeDefined();
        expect(entry?.sources).toHaveLength(1);
        expect(entry?.sources[0]?.provenance).toBe("agent-loop");
        expect(entry?.sources[0]?.stepIds).toEqual(["agent"]);
    });

    it("returns separate sources when a tool is used in both step types", () => {
        const wf = workflow(
            step("start", { type: "start", nextStepId: "call" }),
            step("call", {
                type: "tool-call",
                params: {
                    toolName: "test-tool",
                    toolInput: {
                        name: { type: "literal", value: "hello" },
                        count: { type: "literal", value: 1 },
                    },
                },
                nextStepId: "agent",
            }),
            step("agent", {
                type: "agent-loop",
                params: {
                    instructions: "do things",
                    tools: ["test-tool"],
                    outputFormat: { type: "object" },
                },
                nextStepId: "end",
            }),
            step("end", { type: "end" }),
        );

        const result = auditWorkflow(wf, testTools);
        const entry = result.capabilities.toolCalls.find(
            (tc) => tc.toolName === "test-tool",
        );
        expect(entry).toBeDefined();
        expect(entry?.sources).toHaveLength(2);
        expect(entry?.sources[0]?.provenance).toBe("tool-call");
        expect(entry?.sources[0]?.stepIds).toEqual(["call"]);
        expect(entry?.sources[1]?.provenance).toBe("agent-loop");
        expect(entry?.sources[1]?.stepIds).toEqual(["agent"]);
    });

    it("collects multiple step ids within the same provenance", () => {
        const wf = workflow(
            step("start", { type: "start", nextStepId: "call1" }),
            step("call1", {
                type: "tool-call",
                params: {
                    toolName: "test-tool",
                    toolInput: {
                        name: { type: "literal", value: "hello" },
                        count: { type: "literal", value: 1 },
                    },
                },
                nextStepId: "call2",
            }),
            step("call2", {
                type: "tool-call",
                params: {
                    toolName: "test-tool",
                    toolInput: {
                        name: { type: "literal", value: "world" },
                        count: { type: "literal", value: 2 },
                    },
                },
                nextStepId: "end",
            }),
            step("end", { type: "end" }),
        );

        const result = auditWorkflow(wf, testTools);
        const entry = result.capabilities.toolCalls.find(
            (tc) => tc.toolName === "test-tool",
        );
        expect(entry).toBeDefined();
        expect(entry?.sources).toHaveLength(1);
        expect(entry?.sources[0]?.provenance).toBe("tool-call");
        expect(entry?.sources[0]?.stepIds).toEqual(["call1", "call2"]);

        const schema = entry?.sources[0]?.inputSpace as Record<string, unknown>;
        expect(schema).toHaveProperty("anyOf");
    });

    it("audits connected switch branches when another branch is unconnected", () => {
        const wf = workflow(
            step("start", { type: "start", nextStepId: "switch" }),
            step("switch", {
                type: "switch-case",
                params: {
                    switchOn: { type: "literal", value: true },
                    cases: [
                        {
                            value: { type: "literal", value: true },
                            branchBodyStepId: "call",
                        },
                        {
                            value: { type: "default" },
                            branchBodyStepId: "",
                        },
                    ],
                },
                nextStepId: "end",
            }),
            step("call", {
                type: "tool-call",
                params: {
                    toolName: "test-tool",
                    toolInput: {
                        name: { type: "literal", value: "hello" },
                        count: { type: "literal", value: 1 },
                    },
                },
            }),
            step("end", { type: "end" }),
        );

        const result = auditWorkflow(wf, testTools);
        const entry = result.capabilities.toolCalls.find(
            (toolCall) => toolCall.toolName === "test-tool",
        );
        expect(entry?.sources[0]?.stepIds).toEqual(["call"]);
    });
});

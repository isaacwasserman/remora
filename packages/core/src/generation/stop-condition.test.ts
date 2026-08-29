import { describe, expect, test } from "bun:test";
import type { StepResult, ToolSet } from "ai";
import {
    findLastSuccessfulToolCall,
    hasSuccessfulToolCall,
} from "./stop-condition";

function step({
    calls = [],
    results = [],
}: {
    calls?: Array<{ id: string; name: string }>;
    results?: Array<{ id: string; name: string }>;
}): StepResult<ToolSet> {
    return {
        toolCalls: calls.map(({ id, name }) => ({
            type: "tool-call",
            toolCallId: id,
            toolName: name,
            input: {},
        })),
        toolResults: results.map(({ id, name }) => ({
            type: "tool-result",
            toolCallId: id,
            toolName: name,
            input: {},
            output: "ok",
        })),
    } as unknown as StepResult<ToolSet>;
}

describe("hasSuccessfulToolCall", () => {
    test("is false when no matching tool was called", () => {
        expect(hasSuccessfulToolCall("submit")({ steps: [step({})] })).toBe(
            false,
        );
    });

    test("is false when matching tool execution produced no result", () => {
        expect(
            hasSuccessfulToolCall("submit")({
                steps: [step({ calls: [{ id: "failed", name: "submit" }] })],
            }),
        ).toBe(false);
    });

    test("is true only when the matching call has a successful result", () => {
        const successfulStep = step({
            calls: [{ id: "accepted", name: "submit" }],
            results: [{ id: "accepted", name: "submit" }],
        });

        expect(
            hasSuccessfulToolCall("submit")({ steps: [successfulStep] }),
        ).toBe(true);
        expect(
            findLastSuccessfulToolCall("submit", [successfulStep])?.toolCallId,
        ).toBe("accepted");
    });

    test("does not pair a call with another call's result", () => {
        const mismatchedStep = step({
            calls: [{ id: "failed", name: "submit" }],
            results: [{ id: "other", name: "submit" }],
        });

        expect(
            hasSuccessfulToolCall("submit")({ steps: [mismatchedStep] }),
        ).toBe(false);
    });
});

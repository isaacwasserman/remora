import { expect, test } from "bun:test";
import type { WorkflowStep } from "@remoraflow/core";
import { buildStepList, type CompactEntry } from "./build-step-list";

const items = { type: "jmespath", expression: "items" } as const;

function tool(id: string, nextStepId?: string): WorkflowStep {
    const params = { toolName: "t" };
    return {
        id,
        name: id,
        description: id,
        type: "tool-call",
        params,
        nextStepId,
    };
}

function step(id: string, body: object): WorkflowStep {
    return { id, name: id, description: id, ...body } as WorkflowStep;
}

function list(...steps: WorkflowStep[]) {
    const { entries, unreachable } = buildStepList({
        initialStepId: steps[0]?.id ?? "",
        steps,
    });
    return { entries: outline(entries), unreachable: unreachable.map(outline) };
}

function outline(entries: CompactEntry[]): unknown[] {
    return entries.map((entry) => {
        if (entry.kind === "jump") return `-> ${entry.targetStepId}`;
        if (entry.chains.length === 0) return entry.step.id;
        const chains = entry.chains.map((c) => [c.label, outline(c.entries)]);
        return { [entry.step.id]: Object.fromEntries(chains) };
    });
}

test("nests loop, condition, and case chains under their block step", () => {
    const { entries } = list(
        step("loop", {
            type: "while",
            params: { conditionStepId: "check", loopBodyStepId: "route" },
            nextStepId: "after",
        }),
        tool("check"),
        step("route", {
            type: "switch-case",
            params: {
                switchOn: items,
                cases: [
                    {
                        value: { type: "literal", value: "a" },
                        branchBodyStepId: "a",
                    },
                    { value: { type: "default" }, branchBodyStepId: "" },
                ],
            },
        }),
        tool("a"),
        tool("after"),
    );
    expect(entries).toEqual([
        {
            loop: {
                Condition: ["check"],
                "Loop body": [{ route: { 'Case "a"': ["a"], Default: [] } }],
            },
        },
        "after",
    ]);
});

test("lists each step once and jumps to repeated, looping, or missing targets", () => {
    const { entries, unreachable } = list(
        step("each", {
            type: "for-each",
            params: {
                target: items,
                itemName: "item",
                loopBodyStepId: "shared",
            },
            nextStepId: "shared",
        }),
        tool("shared", "first"),
        tool("first", "each"),
        tool("orphan", "ghost"),
    );
    expect(entries).toEqual([
        { each: { "Loop body": ["shared", "first", "-> each"] } },
        "-> shared",
    ]);
    expect(unreachable).toEqual([["orphan", "-> ghost"]]);
});

test("groups unreachable steps by the chains they start", () => {
    const { entries, unreachable } = list(
        tool("a"),
        tool("y", "z"),
        tool("z"),
        tool("x", "y"),
    );
    expect(entries).toEqual(["a"]);
    expect(unreachable).toEqual([["x", "y", "z"]]);
});

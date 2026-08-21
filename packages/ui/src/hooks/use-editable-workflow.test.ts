import { describe, expect, test } from "bun:test";
import type { WorkflowStep } from "@remoraflow/core";
import {
    clearAllChildRefs,
    clearChildRef,
    getChildStepIds,
    groupStructuralKey,
    replaceChildRef,
    setChildRef,
} from "../utils/nested-chain-refs";

function step(
    id: string,
    type: WorkflowStep["type"],
    overrides?: Record<string, unknown>,
): WorkflowStep {
    return {
        id,
        type,
        name: id,
        description: "",
        ...overrides,
    } as WorkflowStep;
}

function forEachStep(id: string, loopBodyStepId: string): WorkflowStep {
    return step(id, "for-each", {
        params: {
            target: { type: "literal", value: [] },
            itemName: "item",
            loopBodyStepId,
        },
    });
}

function switchCaseStep(
    id: string,
    cases: Array<{ value: unknown; branchBodyStepId: string }>,
): WorkflowStep {
    return step(id, "switch-case", {
        params: {
            switchOn: { type: "literal", value: "" },
            cases,
        },
    });
}

function waitStep(id: string, conditionStepId: string): WorkflowStep {
    return step(id, "wait-for-condition", {
        params: {
            conditionStepId,
            condition: { type: "literal", value: false },
        },
    });
}

function whileStep(
    id: string,
    conditionStepId: string,
    loopBodyStepId: string,
): WorkflowStep {
    return step(id, "while", {
        params: { conditionStepId, loopBodyStepId },
    });
}

describe("group-refs: getChildStepIds", () => {
    test("for-each returns loopBodyStepId when present", () => {
        expect(getChildStepIds(forEachStep("fe", "body"))).toEqual(["body"]);
    });

    test("for-each returns empty when loopBodyStepId is empty", () => {
        expect(getChildStepIds(forEachStep("fe", ""))).toEqual([]);
    });

    test("switch-case returns non-empty branchBodyStepIds", () => {
        const s = switchCaseStep("sc", [
            { value: { type: "literal", value: 1 }, branchBodyStepId: "a" },
            { value: { type: "default" }, branchBodyStepId: "" },
            { value: { type: "literal", value: 2 }, branchBodyStepId: "b" },
        ]);
        expect(getChildStepIds(s)).toEqual(["a", "b"]);
    });

    test("wait-for-condition returns conditionStepId", () => {
        expect(getChildStepIds(waitStep("wc", "cond"))).toEqual(["cond"]);
    });

    test("while returns both conditionStepId and loopBodyStepId", () => {
        const ids = getChildStepIds(whileStep("wh", "cond", "body"));
        expect(ids).toEqual(["cond", "body"]);
    });

    test("while omits empty ids", () => {
        const s = whileStep("wh", "", "body");
        expect(getChildStepIds(s)).toEqual(["body"]);
    });

    test("non-group steps return empty", () => {
        expect(
            getChildStepIds(
                step("s", "sleep", {
                    params: { durationMs: { type: "literal", value: 1000 } },
                }),
            ),
        ).toEqual([]);
        expect(getChildStepIds(step("s", "start"))).toEqual([]);
    });
});

describe("group-refs: clearChildRef", () => {
    test("for-each clears matching loopBodyStepId", () => {
        const result = clearChildRef(forEachStep("fe", "target"), "target");
        expect(
            (result as { params: { loopBodyStepId: string } }).params
                .loopBodyStepId,
        ).toBe("");
    });

    test("for-each is identity for non-matching id", () => {
        const original = forEachStep("fe", "body");
        expect(clearChildRef(original, "other")).toBe(original);
    });

    test("switch-case clears matching branch ids", () => {
        const s = switchCaseStep("sc", [
            { value: { type: "literal", value: 1 }, branchBodyStepId: "a" },
            { value: { type: "default" }, branchBodyStepId: "a" },
        ]);
        const result = clearChildRef(s, "a") as Extract<
            WorkflowStep,
            { type: "switch-case" }
        >;
        expect(
            result.params.cases.every((c) => c.branchBodyStepId === ""),
        ).toBe(true);
    });

    test("while clears both fields independently", () => {
        const s = whileStep("wh", "x", "x");
        const result = clearChildRef(s, "x") as Extract<
            WorkflowStep,
            { type: "while" }
        >;
        expect(result.params.conditionStepId).toBe("");
        expect(result.params.loopBodyStepId).toBe("");
    });
});

describe("group-refs: clearAllChildRefs", () => {
    test("switch-case clears all branch body ids", () => {
        const s = switchCaseStep("sc", [
            { value: { type: "literal", value: 1 }, branchBodyStepId: "a" },
            { value: { type: "literal", value: 2 }, branchBodyStepId: "b" },
        ]);
        const result = clearAllChildRefs(s) as Extract<
            WorkflowStep,
            { type: "switch-case" }
        >;
        expect(result.params.cases.map((c) => c.branchBodyStepId)).toEqual([
            "",
            "",
        ]);
    });

    test("while clears both fields", () => {
        const result = clearAllChildRefs(whileStep("wh", "a", "b")) as Extract<
            WorkflowStep,
            { type: "while" }
        >;
        expect(result.params.conditionStepId).toBe("");
        expect(result.params.loopBodyStepId).toBe("");
    });
});

describe("group-refs: replaceChildRef", () => {
    test("for-each replaces matching id", () => {
        const result = replaceChildRef(
            forEachStep("fe", "old"),
            "old",
            "new",
        ) as Extract<WorkflowStep, { type: "for-each" }>;
        expect(result.params.loopBodyStepId).toBe("new");
    });

    test("switch-case replaces matching branch ids", () => {
        const s = switchCaseStep("sc", [
            { value: { type: "literal", value: 1 }, branchBodyStepId: "old" },
            { value: { type: "default" }, branchBodyStepId: "keep" },
        ]);
        const result = replaceChildRef(s, "old", "new") as Extract<
            WorkflowStep,
            { type: "switch-case" }
        >;
        expect(result.params.cases[0]?.branchBodyStepId).toBe("new");
        expect(result.params.cases[1]?.branchBodyStepId).toBe("keep");
    });

    test("is identity when id does not match", () => {
        const s = forEachStep("fe", "body");
        expect(replaceChildRef(s, "other", "new")).toBe(s);
    });
});

describe("group-refs: setChildRef", () => {
    test("for-each sets loopBodyStepId", () => {
        const result = setChildRef(forEachStep("fe", ""), "target") as Extract<
            WorkflowStep,
            { type: "for-each" }
        >;
        expect(result.params.loopBodyStepId).toBe("target");
    });

    test("switch-case assigns to first empty slot", () => {
        const s = switchCaseStep("sc", [
            { value: { type: "literal", value: 1 }, branchBodyStepId: "taken" },
            { value: { type: "default" }, branchBodyStepId: "" },
        ]);
        const result = setChildRef(s, "new") as Extract<
            WorkflowStep,
            { type: "switch-case" }
        >;
        expect(result.params.cases[0]?.branchBodyStepId).toBe("taken");
        expect(result.params.cases[1]?.branchBodyStepId).toBe("new");
    });

    test("while assigns conditionStepId first, then loopBodyStepId", () => {
        const s1 = whileStep("wh", "", "");
        const r1 = setChildRef(s1, "cond") as Extract<
            WorkflowStep,
            { type: "while" }
        >;
        expect(r1.params.conditionStepId).toBe("cond");
        expect(r1.params.loopBodyStepId).toBe("");

        const r2 = setChildRef(r1, "body") as Extract<
            WorkflowStep,
            { type: "while" }
        >;
        expect(r2.params.conditionStepId).toBe("cond");
        expect(r2.params.loopBodyStepId).toBe("body");
    });

    test("while returns identity when both slots are full", () => {
        const s = whileStep("wh", "a", "b");
        expect(setChildRef(s, "c")).toBe(s);
    });

    test("non-group step returns identity", () => {
        const s = step("s", "sleep", {
            params: { durationMs: { type: "literal", value: 1000 } },
        });
        expect(setChildRef(s, "target")).toBe(s);
    });
});

describe("group-refs: groupStructuralKey", () => {
    test("for-each includes loop body id", () => {
        expect(groupStructuralKey(forEachStep("fe", "body"))).toBe(
            "params.loopBodyStepId=body",
        );
    });

    test("switch-case includes all branch ids", () => {
        const s = switchCaseStep("sc", [
            { value: { type: "literal", value: 1 }, branchBodyStepId: "a" },
            { value: { type: "default" }, branchBodyStepId: "b" },
        ]);
        expect(groupStructuralKey(s)).toBe(
            "params.cases.0.branchBodyStepId=a:params.cases.1.branchBodyStepId=b",
        );
    });

    test("while includes both ids", () => {
        expect(groupStructuralKey(whileStep("wh", "c", "b"))).toBe(
            "params.conditionStepId=c:params.loopBodyStepId=b",
        );
    });

    test("non-group returns empty string", () => {
        expect(
            groupStructuralKey(
                step("s", "tool-call", {
                    params: { toolName: "", toolInput: {} },
                }),
            ),
        ).toBe("");
    });
});

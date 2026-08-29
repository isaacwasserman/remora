import { describe, expect, test } from "bun:test";
import {
    nestedChains,
    STEP_TYPES,
    type StepType,
    type WorkflowStep,
} from "@remoraflow/core";
import { STEP_UI } from "./registry";
import type { FieldKind } from "./types";

function sampleStep(type: StepType): WorkflowStep {
    const base = {
        id: `sample_${type.replace(/-/g, "_")}`,
        name: "",
        description: "",
    };
    switch (type) {
        case "start":
            return { ...base, type: "start" };
        case "end":
            return { ...base, type: "end" };
        case "tool-call":
            return {
                ...base,
                type: "tool-call",
                params: { toolName: "", toolInput: {} },
            };
        case "llm-prompt":
            return {
                ...base,
                type: "llm-prompt",
                params: { prompt: "", outputFormat: {} },
            };
        case "extract-data":
            return {
                ...base,
                type: "extract-data",
                params: {
                    sourceData: { type: "literal", value: "" },
                    outputFormat: {},
                },
            };
        case "switch-case":
            return {
                ...base,
                type: "switch-case",
                params: {
                    switchOn: { type: "literal", value: "" },
                    cases: [
                        {
                            value: { type: "default" },
                            branchBodyStepId: "child_a",
                        },
                    ],
                },
            };
        case "for-each":
            return {
                ...base,
                type: "for-each",
                params: {
                    target: { type: "literal", value: [] },
                    itemName: "item",
                    loopBodyStepId: "child_b",
                },
            };
        case "sleep":
            return {
                ...base,
                type: "sleep",
                params: { durationMs: { type: "literal", value: 1000 } },
            };
        case "while":
            return {
                ...base,
                type: "while",
                params: { conditionStepId: "cond_a", loopBodyStepId: "body_a" },
            };
        case "wait-for-condition":
            return {
                ...base,
                type: "wait-for-condition",
                params: {
                    conditionStepId: "cond_b",
                    condition: { type: "literal", value: false },
                },
            };
        case "agent-loop":
            return {
                ...base,
                type: "agent-loop",
                params: { instructions: "", tools: [], outputFormat: {} },
            };
        case "request-intervention":
            return {
                ...base,
                type: "request-intervention",
                params: {
                    type: "multiple-choice",
                    question: { type: "literal", value: "" },
                    choices: { type: "literal", value: [] },
                    allowFreeResponse: false,
                },
            };
    }
}

describe("STEP_UI registry", () => {
    test("covers every step type", () => {
        const registeredTypes = new Set(Object.keys(STEP_UI));
        for (const t of STEP_TYPES) {
            expect(registeredTypes.has(t)).toBe(true);
        }
    });

    for (const stepType of STEP_TYPES) {
        const ui = STEP_UI[stepType];
        const fields = ui.fields as Record<
            string,
            {
                kind: FieldKind;
                initial: unknown;
                renderIf?: (step: unknown) => boolean;
            }
        >;
        const fieldKeys = new Set(Object.keys(fields));

        describe(stepType, () => {
            test("order covers all fields", () => {
                const orderSet = new Set(ui.order as readonly string[]);
                expect(orderSet).toEqual(fieldKeys);
            });

            test("advanced is a subset of order", () => {
                if (!ui.advanced) return;
                const orderSet = new Set(ui.order as readonly string[]);
                for (const key of ui.advanced as readonly string[]) {
                    expect(orderSet.has(key)).toBe(true);
                }
            });

            test("nodeRows is a subset of order", () => {
                if (!ui.nodeRows) return;
                const orderSet = new Set(ui.order as readonly string[]);
                for (const key of ui.nodeRows as readonly string[]) {
                    expect(orderSet.has(key)).toBe(true);
                }
            });

            test("headerRows is a subset of order", () => {
                if (!ui.headerRows) return;
                const orderSet = new Set(ui.order as readonly string[]);
                for (const key of ui.headerRows as readonly string[]) {
                    expect(orderSet.has(key)).toBe(true);
                }
            });

            test("required params have non-null initial", () => {
                if (ui.paramsOptional) return;
                for (const [key, spec] of Object.entries(fields)) {
                    if (spec.initial === null) {
                        const adv = ui.advanced as
                            | readonly string[]
                            | undefined;
                        const isAdvanced = adv?.includes(key) ?? false;
                        const hasRenderIf = spec.renderIf !== undefined;
                        expect(isAdvanced || hasRenderIf).toBe(true);
                    }
                }
            });

            test("nested chain paths match step-ref and case-list fields", () => {
                const sample = sampleStep(stepType);
                const chains = nestedChains(sample);

                const uiChainPaths = new Set<string>();
                for (const [key, spec] of Object.entries(fields)) {
                    if (spec.kind === "step-ref") {
                        uiChainPaths.add(JSON.stringify(["params", key]));
                    }
                    if (spec.kind === "case-list") {
                        const step = sample as Extract<
                            WorkflowStep,
                            { type: "switch-case" }
                        >;
                        for (let i = 0; i < step.params.cases.length; i++) {
                            uiChainPaths.add(
                                JSON.stringify([
                                    "params",
                                    key,
                                    i,
                                    "branchBodyStepId",
                                ]),
                            );
                        }
                    }
                }

                const coreChainPaths = new Set(
                    chains.map((c) => JSON.stringify(c.path)),
                );

                expect(uiChainPaths).toEqual(coreChainPaths);
            });
        });
    }
});

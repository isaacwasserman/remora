import { describe, expect, test } from "bun:test";
import { tool } from "ai";
import { type } from "arktype";
import type { JSONSchema7 } from "json-schema";
import type { Expression, WorkflowDefinition, WorkflowStep } from "../schema";
import {
    type RemoraflowSettings,
    remoraflowSettingsSchema,
    type ToolSet,
} from "../types";
import { step, workflow } from "../workflow-fixtures";
import { validateWorkflowDefinition } from ".";
import { controlFlowValidator } from "./control-flow-validation";
import { syntaxValidator } from "./syntax-validation";
import { createToolDefinitionValidator } from "./tool-definition-validation";
import { toolInputValidator } from "./tool-input-validation";
import { toolReferenceValidator } from "./tool-reference-validation";
import type { ValidationContext, ValidatorDiagnostic } from "./types";
import { variableReferenceValidator } from "./variable-reference-validation";

const tools: ToolSet = {
    known: tool({ inputSchema: type({}), execute: async () => 1 }),
};

const defaultOptions = remoraflowSettingsSchema.assert({});

const ctx = (
    toolSet: ToolSet = tools,
    optionOverrides: RemoraflowSettings = {},
): ValidationContext => ({
    tools: toolSet,
    options: remoraflowSettingsSchema.assert(optionOverrides),
});

/** Context for the step types the default options switch off. */
const permissiveCtx = () =>
    ctx(tools, { features: { allowUserIntervention: true } });

/**
 * Input the type system would reject, standing in for the untrusted (typically
 * LLM-authored) JSON the syntax validator exists to reject at runtime.
 */
const untrusted = (definition: unknown): WorkflowDefinition =>
    definition as WorkflowDefinition;

function hasError(diagnostics: Array<{ severity: string }>): boolean {
    return diagnostics.some((d) => d.severity === "error");
}

function errorsIn(diagnostics: ValidatorDiagnostic[]): ValidatorDiagnostic[] {
    return diagnostics.filter((d) => d.severity === "error");
}

describe("toolReferenceValidator", () => {
    test("no diagnostics when a tool-call references a known tool", () => {
        const wf = workflow(
            step("call", {
                type: "tool-call",
                params: { toolName: "known", toolInput: {} },
            }),
        );
        expect(toolReferenceValidator.validate(wf, ctx()).diagnostics).toEqual(
            [],
        );
    });

    test("flags a tool-call referencing an unknown tool", () => {
        const wf = workflow(
            step("call", {
                type: "tool-call",
                params: { toolName: "ghost", toolInput: {} },
            }),
        );
        const { diagnostics } = toolReferenceValidator.validate(wf, ctx());
        expect(hasError(diagnostics)).toBe(true);
        expect(diagnostics[0]?.message).toContain("ghost");
    });

    test("flags an unknown tool listed on an agent-loop step", () => {
        const wf = workflow(
            step("agent", {
                type: "agent-loop",
                params: {
                    instructions: "",
                    tools: ["known", "ghost"],
                    outputFormat: { type: "object" },
                },
            }),
        );
        const { diagnostics } = toolReferenceValidator.validate(wf, ctx());
        expect(hasError(diagnostics)).toBe(true);
        expect(diagnostics[0]?.message).toContain("ghost");
    });
});

describe("controlFlowValidator", () => {
    test("accepts a valid reachable chain", () => {
        const wf = workflow(
            step("start", { type: "start", nextStepId: "end" }),
            step("end", { type: "end" }),
        );
        expect(controlFlowValidator.validate(wf, ctx()).diagnostics).toEqual(
            [],
        );
    });

    test("flags an unreachable (orphan) step", () => {
        const wf = workflow(
            step("start", { type: "start", nextStepId: "end" }),
            step("end", { type: "end" }),
            step("orphan", { type: "end" }),
        );
        const { diagnostics } = controlFlowValidator.validate(wf, ctx());
        expect(diagnostics).toEqual([
            {
                severity: "error",
                path: ["steps", 2],
                message:
                    'Step "orphan" is unreachable. All steps must be reachable.',
            },
        ]);
    });

    test("flags a dangling nextStepId reference", () => {
        const wf = workflow(
            step("start", { type: "start", nextStepId: "nowhere" }),
        );
        expect(controlFlowValidator.validate(wf, ctx()).diagnostics).toEqual([
            {
                severity: "error",
                path: ["steps", 0, "nextStepId"],
                message:
                    'Step "nowhere" was given as the nextStepId of step "start", but it cannot be found in the workflow\'s step definitions.',
            },
        ]);
    });

    test("flags a cycle", () => {
        const wf = workflow(
            step("first", { type: "start", nextStepId: "second" }),
            step("second", { type: "end", nextStepId: "first" }),
        );
        expect(controlFlowValidator.validate(wf, ctx()).diagnostics).toEqual([
            {
                severity: "error",
                path: ["steps", 0],
                message:
                    'Workflow graph contains a cycle. Step "first" is visited more than once.',
            },
        ]);
    });

    test("warns when a loop body does not terminate with an end step", () => {
        const wf = workflow(
            step("start", { type: "start", nextStepId: "loop" }),
            step("loop", {
                type: "for-each",
                nextStepId: "end",
                params: {
                    target: { type: "literal", value: [1, 2] },
                    itemName: "item",
                    loopBodyStepId: "body",
                },
            }),
            step("body", {
                type: "tool-call",
                params: { toolName: "known", toolInput: {} },
            }),
            step("end", { type: "end" }),
        );
        const { diagnostics } = controlFlowValidator.validate(wf, ctx());
        expect(hasError(diagnostics)).toBe(false);
        expect(
            diagnostics.some(
                (d) =>
                    d.severity === "warning" &&
                    d.message.includes('for-each step "loop"'),
            ),
        ).toBe(true);
    });

    test("warns when the workflow does not terminate with an end step", () => {
        const wf = workflow(
            step("start", { type: "start", nextStepId: "work" }),
            step("work", {
                type: "tool-call",
                params: { toolName: "known", toolInput: {} },
            }),
        );
        const { diagnostics } = controlFlowValidator.validate(wf, ctx());
        expect(hasError(diagnostics)).toBe(false);
        expect(
            diagnostics.some(
                (d) =>
                    d.severity === "warning" &&
                    d.message.startsWith("The workflow"),
            ),
        ).toBe(true);
    });

    test("warns when a switch-case branch body does not terminate with an end step", () => {
        const wf = workflow(
            step("start", { type: "start", nextStepId: "route" }),
            step("route", {
                type: "switch-case",
                nextStepId: "end",
                params: {
                    switchOn: { type: "literal", value: "a" },
                    cases: [
                        {
                            value: { type: "literal", value: "a" },
                            branchBodyStepId: "branchA",
                        },
                        {
                            value: { type: "default" },
                            branchBodyStepId: "branchB",
                        },
                    ],
                },
            }),
            step("branchA", {
                type: "tool-call",
                params: { toolName: "known", toolInput: {} },
            }),
            step("branchB", { type: "end" }),
            step("end", { type: "end" }),
        );
        const { diagnostics } = controlFlowValidator.validate(wf, ctx());
        expect(hasError(diagnostics)).toBe(false);
        const branchWarnings = diagnostics.filter((d) =>
            d.message.includes("branch body"),
        );
        // Only case 0 is unterminated; case 1 ends in an `end` step.
        expect(branchWarnings).toHaveLength(1);
        expect(branchWarnings[0]?.message).toContain("case 0");
    });

    test("accepts a loop body that terminates with an end step", () => {
        const wf = workflow(
            step("start", { type: "start", nextStepId: "loop" }),
            step("loop", {
                type: "for-each",
                nextStepId: "end",
                params: {
                    target: { type: "literal", value: [1, 2] },
                    itemName: "item",
                    loopBodyStepId: "body",
                },
            }),
            step("body", {
                type: "end",
                params: { output: { type: "jmespath", expression: "item" } },
            }),
            step("end", { type: "end" }),
        );
        expect(controlFlowValidator.validate(wf, ctx()).diagnostics).toEqual(
            [],
        );
    });

    test("warns when a while condition chain does not terminate with an end step", () => {
        const wf = workflow(
            step("start", { type: "start", nextStepId: "loop" }),
            step("loop", {
                type: "while",
                nextStepId: "end",
                params: {
                    conditionStepId: "cond",
                    loopBodyStepId: "body",
                },
            }),
            step("cond", {
                type: "tool-call",
                params: { toolName: "known", toolInput: {} },
            }),
            step("body", {
                type: "end",
                params: { output: { type: "literal", value: 1 } },
            }),
            step("end", { type: "end" }),
        );
        const { diagnostics } = controlFlowValidator.validate(wf, ctx());
        expect(hasError(diagnostics)).toBe(false);
        expect(
            diagnostics.some(
                (d) =>
                    d.severity === "warning" &&
                    d.message.includes('condition chain of while step "loop"'),
            ),
        ).toBe(true);
    });

    test("warns when a while body chain does not terminate with an end step", () => {
        const wf = workflow(
            step("start", { type: "start", nextStepId: "loop" }),
            step("loop", {
                type: "while",
                nextStepId: "end",
                params: {
                    conditionStepId: "cond",
                    loopBodyStepId: "body",
                },
            }),
            step("cond", {
                type: "end",
                params: { output: { type: "literal", value: true } },
            }),
            step("body", {
                type: "tool-call",
                params: { toolName: "known", toolInput: {} },
            }),
            step("end", { type: "end" }),
        );
        const { diagnostics } = controlFlowValidator.validate(wf, ctx());
        expect(hasError(diagnostics)).toBe(false);
        expect(
            diagnostics.some(
                (d) =>
                    d.severity === "warning" &&
                    d.message.includes('loop body of while step "loop"'),
            ),
        ).toBe(true);
    });

    test("accepts a valid while step with both chains ending in end", () => {
        const wf = workflow(
            step("start", { type: "start", nextStepId: "loop" }),
            step("loop", {
                type: "while",
                nextStepId: "end",
                params: {
                    conditionStepId: "cond",
                    loopBodyStepId: "body",
                },
            }),
            step("cond", {
                type: "end",
                params: { output: { type: "literal", value: true } },
            }),
            step("body", {
                type: "end",
                params: { output: { type: "literal", value: 1 } },
            }),
            step("end", { type: "end" }),
        );
        expect(controlFlowValidator.validate(wf, ctx()).diagnostics).toEqual(
            [],
        );
    });
});

describe("syntaxValidator", () => {
    test("accepts a structurally valid workflow and returns the parsed definition", () => {
        const wf: WorkflowDefinition = {
            initialStepId: "start",
            steps: [
                {
                    id: "start",
                    name: "start",
                    description: "",
                    type: "start",
                    nextStepId: "finish",
                },
                { id: "finish", name: "finish", description: "", type: "end" },
            ],
        };
        const { diagnostics, correctedDefinition } = syntaxValidator.validate(
            wf,
            ctx(),
        );
        expect(diagnostics).toEqual([]);
        expect(correctedDefinition).toEqual({
            initialStepId: "start",
            steps: [
                {
                    id: "start",
                    name: "start",
                    description: "",
                    type: "start",
                    nextStepId: "finish",
                },
                { id: "finish", name: "finish", description: "", type: "end" },
            ],
        });
    });

    test("maps a schema violation onto a plain-keyed diagnostic path", () => {
        // The rejection itself is arktype's; what this pins is the only part of
        // the validator we own — unwrapping arktype's path segments into plain
        // keys and attaching a severity.
        const { diagnostics } = syntaxValidator.validate(
            untrusted({
                initialStepId: "start",
                steps: [{ id: "start", type: "nonsense" }],
            }),
            permissiveCtx(),
        );
        expect(diagnostics).toEqual([
            {
                severity: "error",
                path: ["steps", 0, "type"],
                message: expect.stringContaining(
                    'steps[0].type must be "request-intervention"',
                ),
            },
        ]);
    });

    test("rejects undeclared workflow definition properties", () => {
        const { diagnostics } = syntaxValidator.validate(
            untrusted({
                initialStepId: "start",
                steps: [
                    {
                        id: "start",
                        name: "start",
                        description: "",
                        type: "start",
                    },
                ],
                ignoreWarnings: true,
            }),
            ctx({}),
        );

        expect(diagnostics).toEqual([
            {
                severity: "error",
                path: ["ignoreWarnings"],
                message: expect.stringContaining("must be removed"),
            },
        ]);
    });
});

describe("toolDefinitionValidator", () => {
    const anyWorkflow = workflow(step("start", { type: "start" }));

    test("errors when a tool has no execution function", () => {
        const brokenTools: ToolSet = {
            broken: tool({ inputSchema: type({}) }),
        };
        const { diagnostics } = createToolDefinitionValidator({
            assertToolsHaveExecutionFunctions: true,
            assertToolsHaveOutputSchemas: false,
        }).validate(anyWorkflow, ctx(brokenTools));
        expect(hasError(diagnostics)).toBe(true);
        expect(diagnostics[0]?.message).toContain("broken");
    });

    test("warns (not errors) when a tool has no output schema", () => {
        const { diagnostics } = createToolDefinitionValidator({
            assertToolsHaveExecutionFunctions: false,
            assertToolsHaveOutputSchemas: true,
        }).validate(anyWorkflow, ctx());
        expect(hasError(diagnostics)).toBe(false);
        expect(
            diagnostics.some(
                (d) => d.severity === "warning" && d.message.includes("known"),
            ),
        ).toBe(true);
    });

    test("emits nothing when both assertions are disabled", () => {
        const { diagnostics } = createToolDefinitionValidator({
            assertToolsHaveExecutionFunctions: false,
            assertToolsHaveOutputSchemas: false,
        }).validate(anyWorkflow, ctx());
        expect(diagnostics).toEqual([]);
    });
});

describe("variableReferenceValidator", () => {
    const outputFormat: JSONSchema7 = {
        type: "object",
        properties: { answer: { type: "string" } },
        required: ["answer"],
    };
    const workflowReferencing = (expression: string): WorkflowDefinition =>
        workflow(
            step("start", { type: "start", nextStepId: "think" }),
            step("think", {
                type: "llm-prompt",
                nextStepId: "finish",
                params: { prompt: "hi", outputFormat },
            }),
            step("finish", {
                type: "end",
                params: { output: { type: "jmespath", expression } },
            }),
        );

    test("no diagnostics when an expression references a real step-output field", () => {
        expect(
            variableReferenceValidator.validate(
                workflowReferencing("think.answer"),
                ctx(),
            ).diagnostics,
        ).toEqual([]);
    });

    test("flags an expression referencing a nonexistent field", () => {
        expect(
            variableReferenceValidator.validate(
                workflowReferencing("think.nope"),
                ctx(),
            ).diagnostics,
        ).toEqual([
            {
                severity: "error",
                path: ["steps", 2, "params", "output", "expression"],
                message: "Invalid access: always resolves to null.",
            },
        ]);
    });

    /** Loops over `{ n: number }` items and re-emits each one as its output. */
    const workflowWithForEach = (finalExpression: string): WorkflowDefinition =>
        workflow(
            step("start", { type: "start", nextStepId: "loop" }),
            step("loop", {
                type: "for-each",
                nextStepId: "finish",
                params: {
                    target: { type: "literal", value: [{ n: 1 }, { n: 2 }] },
                    itemName: "item",
                    loopBodyStepId: "body",
                },
            }),
            step("body", {
                type: "end",
                params: { output: { type: "jmespath", expression: "item" } },
            }),
            step("finish", {
                type: "end",
                params: {
                    output: {
                        type: "jmespath",
                        expression: finalExpression,
                    },
                },
            }),
        );

    test("treats a for-each output as an array of loop body outputs", () => {
        expect(
            variableReferenceValidator.validate(
                workflowWithForEach("loop[0].n"),
                ctx(),
            ).diagnostics,
        ).toEqual([]);
        expect(
            variableReferenceValidator.validate(
                workflowWithForEach("loop[0].nope"),
                ctx(),
            ).diagnostics,
        ).toEqual([
            {
                severity: "error",
                path: ["steps", 3, "params", "output", "expression"],
                message: "Invalid access: always resolves to null.",
            },
        ]);
    });

    test("infers for-each items from switch branch return values", () => {
        const routingTools: ToolSet = {
            run: tool({
                inputSchema: type({ jobId: "string" }),
                outputSchema: type({ jobId: "string", status: "'ran'" }),
                execute: async ({ jobId }) => ({ jobId, status: "ran" }),
            }),
            defer: tool({
                inputSchema: type({ jobId: "string" }),
                outputSchema: type({
                    jobId: "string",
                    status: "'deferred'",
                }),
                execute: async ({ jobId }) => ({
                    jobId,
                    status: "deferred",
                }),
            }),
        };
        const routedOutputSchema: JSONSchema7 = {
            type: "array",
            items: {
                type: "object",
                properties: {
                    jobId: { type: "string" },
                    status: {
                        type: "string",
                        enum: ["ran", "deferred"],
                    },
                },
                required: ["jobId", "status"],
                additionalProperties: false,
            },
        };
        const definition: WorkflowDefinition = {
            ...workflow(
                step("start", { type: "start", nextStepId: "loop" }),
                step("loop", {
                    type: "for-each",
                    nextStepId: "finish",
                    params: {
                        target: {
                            type: "literal",
                            value: [
                                { jobId: "JOB-1", ready: true },
                                { jobId: "JOB-2", ready: false },
                            ],
                        },
                        itemName: "job",
                        loopBodyStepId: "route",
                    },
                }),
                step("route", {
                    type: "switch-case",
                    params: {
                        switchOn: {
                            type: "jmespath",
                            expression: "job.ready",
                        },
                        cases: [
                            {
                                value: { type: "literal", value: true },
                                branchBodyStepId: "run",
                            },
                            {
                                value: { type: "default" },
                                branchBodyStepId: "defer",
                            },
                        ],
                    },
                }),
                step("run", {
                    type: "tool-call",
                    nextStepId: "returnRun",
                    params: {
                        toolName: "run",
                        toolInput: {
                            jobId: {
                                type: "jmespath",
                                expression: "job.jobId",
                            },
                        },
                    },
                }),
                step("returnRun", {
                    type: "end",
                    params: {
                        output: { type: "jmespath", expression: "run" },
                    },
                }),
                step("defer", {
                    type: "tool-call",
                    nextStepId: "returnDefer",
                    params: {
                        toolName: "defer",
                        toolInput: {
                            jobId: {
                                type: "jmespath",
                                expression: "job.jobId",
                            },
                        },
                    },
                }),
                step("returnDefer", {
                    type: "end",
                    params: {
                        output: { type: "jmespath", expression: "defer" },
                    },
                }),
                step("finish", {
                    type: "end",
                    params: {
                        output: { type: "jmespath", expression: "loop" },
                    },
                }),
            ),
            outputSchema: routedOutputSchema,
        };

        expect(
            validateWorkflowDefinition(definition, ctx(routingTools)),
        ).toMatchObject({ isValid: true, diagnostics: [] });
    });

    test("retains null when a switch branch actually returns null", () => {
        const definition: WorkflowDefinition = {
            ...workflow(
                step("start", { type: "start", nextStepId: "loop" }),
                step("loop", {
                    type: "for-each",
                    nextStepId: "finish",
                    params: {
                        target: { type: "literal", value: [true, false] },
                        itemName: "ready",
                        loopBodyStepId: "route",
                    },
                }),
                step("route", {
                    type: "switch-case",
                    params: {
                        switchOn: {
                            type: "jmespath",
                            expression: "ready",
                        },
                        cases: [
                            {
                                value: { type: "literal", value: true },
                                branchBodyStepId: "returnObject",
                            },
                            {
                                value: { type: "default" },
                                branchBodyStepId: "returnNull",
                            },
                        ],
                    },
                }),
                step("returnObject", {
                    type: "end",
                    params: {
                        output: {
                            type: "literal",
                            value: { status: "ran" },
                        },
                    },
                }),
                step("returnNull", { type: "end" }),
                step("finish", {
                    type: "end",
                    params: {
                        output: { type: "jmespath", expression: "loop" },
                    },
                }),
            ),
            outputSchema: {
                type: "array",
                items: {
                    type: "object",
                    properties: { status: { const: "ran" } },
                    required: ["status"],
                    additionalProperties: false,
                },
            },
        };
        const { isValid, diagnostics } = validateWorkflowDefinition(
            definition,
            ctx({}),
        );

        expect(isValid).toBe(true);
        expect(diagnostics).toEqual([
            {
                severity: "warning",
                path: ["steps", 5, "params", "output", "items"],
                message: expect.stringContaining("Possibly invalid"),
            },
        ]);
    });

    test("flags a field access on a for-each output (it is an array)", () => {
        expect(
            variableReferenceValidator.validate(
                workflowWithForEach("loop.nope"),
                ctx(),
            ).diagnostics,
        ).toEqual([
            {
                severity: "error",
                path: ["steps", 3, "params", "output", "expression"],
                message: "Invalid access: always resolves to null.",
            },
        ]);
    });

    const workflowWithWhile = (finalExpression: string): WorkflowDefinition =>
        workflow(
            step("start", { type: "start", nextStepId: "loop" }),
            step("loop", {
                type: "while",
                nextStepId: "finish",
                params: {
                    conditionStepId: "cond",
                    loopBodyStepId: "body",
                },
            }),
            step("cond", {
                type: "end",
                params: { output: { type: "literal", value: true } },
            }),
            step("body", {
                type: "end",
                params: {
                    output: {
                        type: "literal",
                        value: { n: 1 },
                    },
                },
            }),
            step("finish", {
                type: "end",
                params: {
                    output: {
                        type: "jmespath",
                        expression: finalExpression,
                    },
                },
            }),
        );

    test("treats a while output as an array of loop body outputs", () => {
        expect(
            variableReferenceValidator.validate(
                workflowWithWhile("loop[0].n"),
                ctx(),
            ).diagnostics,
        ).toEqual([]);
        expect(
            variableReferenceValidator.validate(
                workflowWithWhile("loop[0].nope"),
                ctx(),
            ).diagnostics,
        ).toEqual([
            {
                severity: "error",
                path: ["steps", 4, "params", "output", "expression"],
                message: "Invalid access: always resolves to null.",
            },
        ]);
    });

    test("flags a field access on a while output (it is an array)", () => {
        expect(
            variableReferenceValidator.validate(
                workflowWithWhile("loop.nope"),
                ctx(),
            ).diagnostics,
        ).toEqual([
            {
                severity: "error",
                path: ["steps", 4, "params", "output", "expression"],
                message: "Invalid access: always resolves to null.",
            },
        ]);
    });

    const workflowWithForEachAccumulator = (
        finalExpression: string,
    ): WorkflowDefinition =>
        workflow(
            step("start", { type: "start", nextStepId: "loop" }),
            step("loop", {
                type: "for-each",
                nextStepId: "finish",
                params: {
                    target: {
                        type: "literal",
                        value: [{ n: 1 }, { n: 2 }],
                    },
                    itemName: "item",
                    loopBodyStepId: "body",
                    accumulatorName: "acc",
                    accumulatorInitialValue: {
                        type: "literal",
                        value: { total: 0 },
                    },
                },
            }),
            step("body", {
                type: "end",
                params: { output: { type: "jmespath", expression: "acc" } },
            }),
            step("finish", {
                type: "end",
                params: {
                    output: {
                        type: "jmespath",
                        expression: finalExpression,
                    },
                },
            }),
        );

    test("for-each body can reference the accumulator name", () => {
        expect(
            variableReferenceValidator.validate(
                workflowWithForEachAccumulator("loop.total"),
                ctx(),
            ).diagnostics,
        ).toEqual([]);
    });

    test("for-each with accumulator output is not an array", () => {
        expect(
            variableReferenceValidator.validate(
                workflowWithForEachAccumulator("loop[0]"),
                ctx(),
            ).diagnostics,
        ).toEqual([
            {
                severity: "error",
                path: ["steps", 3, "params", "output", "expression"],
                message: "Invalid access: always resolves to null.",
            },
        ]);
    });
});

describe("validateWorkflowDefinition", () => {
    test("isValid is false and the pipeline blocks when syntax fails", () => {
        const { isValid, diagnostics } = validateWorkflowDefinition(
            untrusted({
                initialStepId: "start",
                steps: [{ id: "start", type: "nonsense" }],
            }),
            permissiveCtx(),
        );
        expect(isValid).toBe(false);
        // Every later pass would add something — the tool-definition pass alone
        // warns unconditionally about `known` — so the syntax error standing as
        // the sole diagnostic is what proves the pipeline stopped.
        expect(diagnostics).toEqual([
            {
                severity: "error",
                path: ["steps", 0, "type"],
                message: expect.stringContaining(
                    'steps[0].type must be "request-intervention"',
                ),
            },
        ]);
    });

    test("isValid stays true when only warnings are produced", () => {
        // `known` has an execution function but no output schema → warning only.
        const wf = workflow(
            step("start", { type: "start", nextStepId: "end" }),
            step("end", { type: "end" }),
        );
        const { isValid, diagnostics } = validateWorkflowDefinition(wf, ctx());
        expect(isValid).toBe(true);
        expect(diagnostics.some((d) => d.severity === "warning")).toBe(true);
    });
});

describe("toolInputValidator", () => {
    const typedTools: ToolSet = {
        adder: tool({ inputSchema: type({ n: "number" }) }),
    };

    function callWith(value: unknown): WorkflowDefinition {
        return workflow(
            step("start", { type: "start", nextStepId: "call" }),
            step("call", {
                type: "tool-call",
                nextStepId: "finish",
                params: {
                    toolName: "adder",
                    toolInput: { n: { type: "literal", value } },
                },
            }),
            step("finish", { type: "end" }),
        );
    }

    test("no diagnostics when a literal input matches the tool schema", () => {
        expect(
            toolInputValidator.validate(callWith(42), ctx(typedTools))
                .diagnostics,
        ).toEqual([]);
    });

    test("flags a wrong-typed literal input as an error", () => {
        const { diagnostics } = toolInputValidator.validate(
            callWith("not-a-number"),
            ctx(typedTools),
        );
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]?.severity).toBe("error");
        expect(diagnostics[0]?.path).toEqual([
            "steps",
            1,
            "params",
            "toolInput",
            "n",
        ]);
    });

    test("a dynamic reference resolving to an unknown type is a warning, not an error", () => {
        const wf: WorkflowDefinition = {
            inputSchema: { type: "object" },
            initialStepId: "start",
            steps: [
                step("start", { type: "start", nextStepId: "call" }),
                step("call", {
                    type: "tool-call",
                    nextStepId: "finish",
                    params: {
                        toolName: "adder",
                        toolInput: {
                            n: { type: "jmespath", expression: "input.foo" },
                        },
                    },
                }),
                step("finish", { type: "end" }),
            ],
        };
        const { diagnostics } = toolInputValidator.validate(
            wf,
            ctx(typedTools),
        );
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]?.severity).toBe("warning");
    });

    test("a tool-call to an unknown tool is skipped (left to the tool-reference validator)", () => {
        const wf = workflow(
            step("start", { type: "start", nextStepId: "call" }),
            step("call", {
                type: "tool-call",
                nextStepId: "finish",
                params: {
                    toolName: "ghost",
                    toolInput: { n: { type: "literal", value: "x" } },
                },
            }),
            step("finish", { type: "end" }),
        );
        expect(
            toolInputValidator.validate(wf, ctx(typedTools)).diagnostics,
        ).toEqual([]);
    });

    test("problems in multiple tool-call steps are each reported at their step index", () => {
        const wf = workflow(
            step("start", { type: "start", nextStepId: "c1" }),
            step("c1", {
                type: "tool-call",
                nextStepId: "c2",
                params: {
                    toolName: "adder",
                    toolInput: { n: { type: "literal", value: "a" } },
                },
            }),
            step("c2", {
                type: "tool-call",
                nextStepId: "finish",
                params: {
                    toolName: "adder",
                    toolInput: { n: { type: "literal", value: "b" } },
                },
            }),
            step("finish", { type: "end" }),
        );
        const { diagnostics } = toolInputValidator.validate(
            wf,
            ctx(typedTools),
        );
        expect(
            diagnostics.map((d) => ({
                severity: d.severity,
                step: d.path?.[1],
            })),
        ).toEqual([
            { severity: "error", step: 1 },
            { severity: "error", step: 2 },
        ]);
    });
});

describe("block steps with nested chains", () => {
    /** Outer loop whose body's last step is itself a loop. */
    const nestedLoops = (afterLoopOutput: string): WorkflowDefinition =>
        workflow(
            step("outer", {
                type: "for-each",
                nextStepId: "done",
                params: {
                    target: { type: "literal", value: [1] },
                    itemName: "i",
                    loopBodyStepId: "inner",
                },
            }),
            step("inner", {
                type: "for-each",
                params: {
                    target: { type: "literal", value: [2] },
                    itemName: "j",
                    loopBodyStepId: "body",
                },
            }),
            step("body", {
                type: "end",
                params: { output: { type: "jmespath", expression: "j" } },
            }),
            step("done", {
                type: "end",
                params: {
                    output: { type: "jmespath", expression: afterLoopOutput },
                },
            }),
        );

    const invalidAccessAtDone: ValidatorDiagnostic = {
        severity: "error",
        path: ["steps", 3, "params", "output", "expression"],
        message: "Invalid access: always resolves to null.",
    };

    test("a step after a loop whose body ends in a nested loop still gets a scope", () => {
        // The continuation belongs to the block step, not to the nested chain's
        // terminal step, so it stays reachable no matter how deeply it nests.
        expect(
            errorsIn(
                validateWorkflowDefinition(nestedLoops("outer"), ctx())
                    .diagnostics,
            ),
        ).toEqual([]);
        // A step with no scope is skipped rather than reported, so a clean run
        // proves nothing on its own — `done` must also still be type-checked.
        expect(
            errorsIn(
                validateWorkflowDefinition(nestedLoops("notBound"), ctx())
                    .diagnostics,
            ),
        ).toEqual([invalidAccessAtDone]);
    });

    test("a loop variable does not leak into the scope after the loop", () => {
        expect(
            errorsIn(
                validateWorkflowDefinition(nestedLoops("i"), ctx()).diagnostics,
            ),
        ).toEqual([invalidAccessAtDone]);
    });

    type WaitParams = Extract<
        WorkflowStep,
        { type: "wait-for-condition" }
    >["params"];

    const waitWorkflow = (
        overrides: Partial<WaitParams> = {},
    ): WorkflowDefinition =>
        workflow(
            step("wait", {
                type: "wait-for-condition",
                nextStepId: "fin",
                params: {
                    conditionStepId: "check",
                    condition: {
                        type: "jmespath",
                        expression: "check.ready",
                    },
                    intervalMs: {
                        type: "literal",
                        value:
                            defaultOptions.duration.minPollIntervalSeconds *
                            1000,
                    },
                    ...overrides,
                },
            }),
            step("check", {
                type: "end",
                params: {
                    output: { type: "literal", value: { ready: true } },
                },
            }),
            step("fin", {
                type: "end",
                params: { output: { type: "jmespath", expression: "wait" } },
            }),
        );

    test("a condition chain is reachable and its bindings resolve in `condition`", () => {
        const wf = waitWorkflow();
        expect(controlFlowValidator.validate(wf, ctx()).diagnostics).toEqual([
            {
                severity: "warning",
                path: ["initialStepId"],
                message:
                    'The initial step "wait" is of type "wait-for-condition", not "start". A "start" step is recommended as the entry point.',
            },
        ]);
        // `condition` reads `check.ready`, which the condition chain binds —
        // nothing in scope at the wait step itself provides it.
        expect(
            variableReferenceValidator.validate(wf, ctx()).diagnostics,
        ).toEqual([]);
    });

    test("flags a `condition` reference the condition chain does not bind", () => {
        // Reading a bound and an unbound field together pins that the condition
        // chain's scope is the one used: against the wait step's own scope
        // neither would resolve, so both reads would be flagged.
        const wf = waitWorkflow({
            condition: {
                type: "template",
                template: "${check.ready} then ${check.nope}",
            },
        });
        expect(
            variableReferenceValidator.validate(wf, ctx()).diagnostics,
        ).toEqual([
            {
                severity: "error",
                path: ["steps", 0, "params", "condition", "template"],
                message: "Invalid access: always resolves to null.",
            },
        ]);
    });

    test("flags a dangling conditionStepId instead of throwing", () => {
        const { diagnostics } = validateWorkflowDefinition(
            waitWorkflow({ conditionStepId: "ghost" }),
            ctx(),
        );
        expect(diagnostics.map((d) => d.message)).toEqual([
            expect.stringContaining(
                'Step "ghost" was given as the start of the condition chain',
            ),
        ]);
    });

    test("detects a cycle routed through a condition chain", () => {
        const cyclic = workflow(
            step("wait", {
                type: "wait-for-condition",
                params: {
                    conditionStepId: "check",
                    condition: { type: "literal", value: true },
                    intervalMs: {
                        type: "literal",
                        value:
                            defaultOptions.duration.minPollIntervalSeconds *
                            1000,
                    },
                },
            }),
            step("check", {
                type: "tool-call",
                nextStepId: "wait",
                params: { toolName: "known", toolInput: {} },
            }),
        );
        expect(
            controlFlowValidator
                .validate(cyclic, ctx())
                .diagnostics.map((d) => d.message),
        ).toEqual([
            'The initial step "wait" is of type "wait-for-condition", not "start". A "start" step is recommended as the entry point.',
            expect.stringContaining("contains a cycle"),
        ]);
    });
});

describe("switch-case branch bindings", () => {
    /** Reads `expression` after a switch whose branches bind different ids. */
    const readingAfterSwitch = (expression: string): WorkflowDefinition =>
        workflow(
            step("pick", {
                type: "switch-case",
                nextStepId: "after",
                params: {
                    switchOn: { type: "literal", value: "a" },
                    cases: [
                        {
                            value: { type: "literal", value: "a" },
                            branchBodyStepId: "brA",
                        },
                        {
                            value: { type: "default" },
                            branchBodyStepId: "brB",
                        },
                    ],
                },
            }),
            step("brA", {
                type: "end",
                params: { output: { type: "literal", value: { n: 1 } } },
            }),
            step("brB", {
                type: "end",
                params: { output: { type: "literal", value: { n: 2 } } },
            }),
            step("after", {
                type: "end",
                params: { output: { type: "jmespath", expression } },
            }),
        );

    test("warns that a branch-only binding may be absent", () => {
        // Only one branch binds `brA`, so after the switch it may be null. That
        // has to be surfaced — but as a warning, since reading a branch's output
        // is the normal way to use a switch.
        const { isValid, diagnostics } = validateWorkflowDefinition(
            readingAfterSwitch("brA.n"),
            ctx(),
        );
        expect(isValid).toBe(true);
        expect(
            diagnostics.filter((d) =>
                d.message.includes("may resolve to null"),
            ),
        ).toEqual([
            {
                severity: "warning",
                path: ["steps", 3, "params", "output", "expression"],
                message: "Possibly-invalid access: may resolve to null.",
            },
        ]);
    });

    test("still errors on a field the branch output never has", () => {
        // Nullability must not swallow genuine mistakes.
        const { isValid, diagnostics } = validateWorkflowDefinition(
            readingAfterSwitch("brA.nope"),
            ctx(),
        );
        expect(isValid).toBe(false);
        expect(errorsIn(diagnostics)).toEqual([
            {
                severity: "error",
                path: ["steps", 3, "params", "output", "expression"],
                message: "Invalid access: always resolves to null.",
            },
        ]);
    });
});

describe("request-intervention answerability", () => {
    const askStep = (choices: Expression, allowFreeResponse: boolean) =>
        workflow(
            step("ask", {
                type: "request-intervention",
                nextStepId: "fin",
                params: {
                    type: "multiple-choice",
                    question: { type: "literal", value: "Ship it?" },
                    choices,
                    allowFreeResponse,
                },
            }),
            step("fin", {
                type: "end",
                params: { output: { type: "jmespath", expression: "ask" } },
            }),
        );

    test("rejects an empty literal choice list with no free response", () => {
        // Nothing the supervisor could reply with, so the step would wait forever.
        const { isValid, diagnostics } = validateWorkflowDefinition(
            askStep({ type: "literal", value: [] }, false),
            permissiveCtx(),
        );
        expect(isValid).toBe(false);
        expect(diagnostics[0]?.message).toContain("answerable");
    });

    test("accepts an empty choice list when a free response is allowed", () => {
        expect(
            validateWorkflowDefinition(
                askStep({ type: "literal", value: [] }, true),
                permissiveCtx(),
            ).isValid,
        ).toBe(true);
    });

    test("accepts a non-empty choice list", () => {
        expect(
            validateWorkflowDefinition(
                askStep({ type: "literal", value: ["yes", "no"] }, false),
                permissiveCtx(),
            ).isValid,
        ).toBe(true);
    });

    test("leaves a dynamic choice list to execution time", () => {
        // Its value is unknown here, so it cannot be judged statically.
        expect(
            validateWorkflowDefinition(
                askStep({ type: "jmespath", expression: "ask" }, false),
                permissiveCtx(),
            ).isValid,
        ).toBe(true);
    });
});

describe("reserved step ids", () => {
    // The runtime keys its own checkpoints under a `__remoraflow` path segment
    // (see `execution-engine/step-path.ts`). That namespace is only safe
    // because an author cannot produce a step id that collides with it.
    test.each([
        ["__remoraflow"],
        ["__anything"],
        ["__"],
    ])("rejects the id %s", (id) => {
        const { isValid } = validateWorkflowDefinition(
            untrusted({
                initialStepId: id,
                steps: [
                    {
                        id,
                        name: "n",
                        description: "",
                        type: "start",
                        nextStepId: "fin",
                    },
                    { id: "fin", name: "f", description: "", type: "end" },
                ],
            }),
            ctx(),
        );
        expect(isValid).toBe(false);
    });

    test("still accepts a single leading underscore", () => {
        const { isValid } = validateWorkflowDefinition(
            workflow(
                step("_start", { type: "start", nextStepId: "fin" }),
                step("fin", { type: "end" }),
            ),
            ctx(),
        );
        expect(isValid).toBe(true);
    });
});

describe("the poll interval floor at author time", () => {
    const withInterval = (intervalMs: number) =>
        workflow(
            step("wait", {
                type: "wait-for-condition",
                nextStepId: "fin",
                params: {
                    conditionStepId: "fin",
                    condition: { type: "literal", value: true },
                    intervalMs: { type: "literal", value: intervalMs },
                },
            }),
            step("fin", { type: "end" }),
        );

    test("rejects a literal interval below minPollIntervalSeconds", () => {
        const { isValid } = validateWorkflowDefinition(
            withInterval(1_000),
            ctx(tools, { duration: { minPollIntervalSeconds: 60 } }),
        );
        expect(isValid).toBe(false);
    });

    test("accepts one at the floor", () => {
        const { diagnostics } = validateWorkflowDefinition(
            withInterval(60_000),
            ctx(tools, { duration: { minPollIntervalSeconds: 60 } }),
        );
        expect(errorsIn(diagnostics)).toEqual([]);
    });
});

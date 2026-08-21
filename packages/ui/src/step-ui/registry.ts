import type { StepType } from "@remoraflow/core";
import type { JSONSchema7 } from "json-schema";
import {
    Bot,
    FileOutput,
    GitBranch,
    Hand,
    MessageCircleQuestionMark,
    Moon,
    Play,
    RefreshCw,
    Repeat,
    Sparkles,
    Timer,
    Wrench,
} from "lucide-react";
import type { ParamKey } from "./params";
import type { StepUi } from "./types";

function defineStep<T extends StepType, const O extends readonly ParamKey<T>[]>(
    _type: T,
    spec: Omit<StepUi<T>, "order"> & { order: O } & ([
            Exclude<ParamKey<T>, O[number]>,
        ] extends [never]
            ? Record<never, never>
            : {
                  readonly __orderIsMissingFields: Exclude<
                      ParamKey<T>,
                      O[number]
                  >;
              }),
): StepUi<T> {
    return spec as StepUi<T>;
}

const DEFAULT_OUTPUT_FORMAT: JSONSchema7 = {
    type: "object",
    properties: { result: { type: "string" } },
    required: ["result"],
};

export const STEP_UI = {
    start: defineStep("start", {
        label: "Start",
        icon: Play,
        tone: "start",
        blurb: "Entry point of the workflow",
        paletteOrder: 0,
        fields: {} as Record<string, never>,
        order: [] as const,
        workflowExtras: ["inputSchema"],
    }),

    end: defineStep("end", {
        label: "End",
        icon: Hand,
        tone: "end",
        blurb: "Terminal step; optionally produces workflow output",
        paletteOrder: 1,
        fields: {
            output: {
                kind: "expression",
                label: "Output",
                initial: null,
                allowJmespath: true,
                allowTemplate: true,
            },
        },
        order: ["output"] as const,
        paramsOptional: true,
        workflowExtras: ["outputSchema"],
    }),

    "tool-call": defineStep("tool-call", {
        label: "Tool Call",
        icon: Wrench,
        tone: "tool-call",
        blurb: "Call a tool with mapped inputs",
        paletteOrder: 2,
        fields: {
            toolName: {
                kind: "tool-ref",
                label: "Tool Name",
                initial: "",
            },
            toolInput: {
                kind: "expression-map",
                label: "Tool Input",
                initial: {},
            },
        },
        order: ["toolName", "toolInput"] as const,
        nodeRows: ["toolName"] as const,
    }),

    "llm-prompt": defineStep("llm-prompt", {
        label: "LLM Prompt",
        icon: Sparkles,
        tone: "llm-prompt",
        blurb: "Prompt an LLM to produce structured output",
        paletteOrder: 3,
        fields: {
            prompt: {
                kind: "template-text",
                label: "Prompt",
                initial: "",
            },
            outputFormat: {
                kind: "json-schema",
                label: "Output Format",
                initial: DEFAULT_OUTPUT_FORMAT,
            },
        },
        order: ["prompt", "outputFormat"] as const,
        nodeRows: ["prompt"] as const,
    }),

    "extract-data": defineStep("extract-data", {
        label: "Extract Data",
        icon: FileOutput,
        tone: "extract-data",
        blurb: "Extract structured data from a source using an LLM",
        paletteOrder: 4,
        fields: {
            sourceData: {
                kind: "expression",
                label: "Source Data",
                initial: { type: "literal", value: "" },
                allowJmespath: true,
                allowTemplate: true,
            },
            outputFormat: {
                kind: "json-schema",
                label: "Output Format",
                initial: DEFAULT_OUTPUT_FORMAT,
            },
        },
        order: ["sourceData", "outputFormat"] as const,
        nodeRows: ["sourceData"] as const,
    }),

    "switch-case": defineStep("switch-case", {
        label: "Switch Case",
        icon: GitBranch,
        tone: "switch-case",
        blurb: "Branch to different step chains based on an expression",
        paletteOrder: 5,
        fields: {
            switchOn: {
                kind: "expression",
                label: "Switch On",
                initial: { type: "literal", value: "" },
                allowJmespath: true,
                allowTemplate: false,
            },
            cases: {
                kind: "case-list",
                label: "Cases",
                initial: [{ value: { type: "default" }, branchBodyStepId: "" }],
            },
        },
        order: ["switchOn", "cases"] as const,
        nodeRows: ["switchOn"] as const,
    }),

    "for-each": defineStep("for-each", {
        label: "For Each",
        icon: Repeat,
        tone: "for-each",
        blurb: "Iterate over a list and run a step chain per item",
        paletteOrder: 6,
        fields: {
            target: {
                kind: "expression",
                label: "Target Array",
                initial: { type: "literal", value: [] },
                allowJmespath: true,
                allowTemplate: false,
            },
            itemName: {
                kind: "identifier",
                label: "Item Variable Name",
                initial: "item",
            },
            loopBodyStepId: {
                kind: "step-ref",
                label: "Loop Body Step",
                initial: "",
            },
            accumulatorName: {
                kind: "identifier",
                label: "Accumulator Name",
                initial: null,
            },
            accumulatorInitialValue: {
                kind: "expression",
                label: "Accumulator Initial Value",
                initial: null,
                allowJmespath: true,
                allowTemplate: false,
                renderIf: (step: unknown) =>
                    !!(step as { params?: { accumulatorName?: string } }).params
                        ?.accumulatorName,
            },
        },
        order: [
            "target",
            "itemName",
            "loopBodyStepId",
            "accumulatorName",
            "accumulatorInitialValue",
        ] as const,
        advanced: ["accumulatorName", "accumulatorInitialValue"] as const,
        nodeRows: ["target", "itemName"] as const,
    }),

    sleep: defineStep("sleep", {
        label: "Sleep",
        icon: Moon,
        tone: "sleep",
        blurb: "Pause execution for a specified duration",
        paletteOrder: 7,
        fields: {
            durationMs: {
                kind: "expression",
                label: "Duration (ms)",
                initial: { type: "literal", value: 1000 },
                allowJmespath: true,
                allowTemplate: false,
                schemaHint: { type: "number", minimum: 0 },
            },
        },
        order: ["durationMs"] as const,
        nodeRows: ["durationMs"] as const,
    }),

    while: defineStep("while", {
        label: "While",
        icon: RefreshCw,
        tone: "while",
        blurb: "Loop while a condition chain evaluates to truthy",
        paletteOrder: 8,
        fields: {
            conditionStepId: {
                kind: "step-ref",
                label: "Condition Step",
                initial: "",
            },
            loopBodyStepId: {
                kind: "step-ref",
                label: "Loop Body Step",
                initial: "",
            },
            accumulatorName: {
                kind: "identifier",
                label: "Accumulator Name",
                initial: null,
            },
            accumulatorInitialValue: {
                kind: "expression",
                label: "Accumulator Initial Value",
                initial: null,
                allowJmespath: true,
                allowTemplate: false,
                renderIf: (step: unknown) =>
                    !!(step as { params?: { accumulatorName?: string } }).params
                        ?.accumulatorName,
            },
        },
        order: [
            "conditionStepId",
            "loopBodyStepId",
            "accumulatorName",
            "accumulatorInitialValue",
        ] as const,
        advanced: ["accumulatorName", "accumulatorInitialValue"] as const,
    }),

    "wait-for-condition": defineStep("wait-for-condition", {
        label: "Wait for Condition",
        icon: Timer,
        tone: "wait-for-condition",
        blurb: "Poll a condition chain until it evaluates to truthy",
        paletteOrder: 9,
        fields: {
            conditionStepId: {
                kind: "step-ref",
                label: "Condition Step",
                initial: "",
            },
            condition: {
                kind: "expression",
                label: "Condition",
                initial: { type: "literal", value: false },
                allowJmespath: true,
                allowTemplate: false,
            },
            // Core's arktype .default() supplies settings-derived values at
            // validation time; a UI-seeded literal would shadow them.
            maxAttempts: {
                kind: "expression",
                label: "Max Attempts",
                initial: null,
                allowJmespath: false,
                allowTemplate: false,
                schemaHint: { type: "number", minimum: 1 },
            },
            intervalMs: {
                kind: "expression",
                label: "Interval (ms)",
                initial: null,
                allowJmespath: false,
                allowTemplate: false,
                schemaHint: { type: "number", minimum: 0 },
            },
            backoffMultiplier: {
                kind: "expression",
                label: "Backoff Multiplier",
                initial: null,
                allowJmespath: false,
                allowTemplate: false,
                schemaHint: { type: "number", minimum: 1 },
            },
            timeoutMs: {
                kind: "expression",
                label: "Timeout (ms)",
                initial: null,
                allowJmespath: false,
                allowTemplate: false,
                schemaHint: { type: "number", minimum: 0 },
            },
        },
        order: [
            "conditionStepId",
            "condition",
            "maxAttempts",
            "intervalMs",
            "backoffMultiplier",
            "timeoutMs",
        ] as const,
        advanced: [
            "maxAttempts",
            "intervalMs",
            "backoffMultiplier",
            "timeoutMs",
        ] as const,
    }),

    "agent-loop": defineStep("agent-loop", {
        label: "Agent Loop",
        icon: Bot,
        tone: "agent-loop",
        blurb: "Delegate work to an autonomous tool-calling agent",
        paletteOrder: 10,
        fields: {
            instructions: {
                kind: "template-text",
                label: "Instructions",
                initial: "",
            },
            tools: {
                kind: "tool-ref-list",
                label: "Tools",
                initial: [],
            },
            outputFormat: {
                kind: "json-schema",
                label: "Output Format",
                initial: DEFAULT_OUTPUT_FORMAT,
            },
            inputConstraints: {
                kind: "schema-map",
                label: "Input Constraints",
                initial: null,
            },
            maxSteps: {
                kind: "expression",
                label: "Max Steps",
                initial: null,
                allowJmespath: false,
                allowTemplate: false,
                schemaHint: { type: "number", minimum: 1 },
            },
        },
        order: [
            "instructions",
            "tools",
            "outputFormat",
            "inputConstraints",
            "maxSteps",
        ] as const,
        advanced: ["inputConstraints", "maxSteps"] as const,
        nodeRows: ["instructions", "tools"] as const,
    }),

    "request-intervention": defineStep("request-intervention", {
        label: "Request Intervention",
        icon: MessageCircleQuestionMark,
        tone: "request-intervention",
        blurb: "Pause and ask the supervising user for input",
        paletteOrder: 11,
        fields: {
            type: {
                kind: "constant",
                label: "Intervention Type",
                initial: "multiple-choice",
                options: ["multiple-choice"] as const,
            },
            question: {
                kind: "expression",
                label: "Question",
                initial: { type: "literal", value: "" },
                allowJmespath: true,
                allowTemplate: true,
            },
            choices: {
                kind: "expression",
                label: "Choices",
                initial: { type: "literal", value: [] },
                allowJmespath: true,
                allowTemplate: false,
            },
            allowFreeResponse: {
                kind: "boolean",
                label: "Allow Free Response",
                initial: false,
            },
        },
        order: ["type", "question", "choices", "allowFreeResponse"] as const,
        nodeRows: ["question"] as const,
    }),
} satisfies { [T in StepType]: StepUi<T> };

export type StepUiRegistry = typeof STEP_UI;

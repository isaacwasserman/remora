import type { WorkflowStep } from "./schema";

export const STEP_TYPES = [
    "agent-loop",
    "end",
    "extract-data",
    "for-each",
    "llm-prompt",
    "request-intervention",
    "sleep",
    "start",
    "switch-case",
    "tool-call",
    "wait-for-condition",
    "while",
] as const;

export type StepType = (typeof STEP_TYPES)[number];

export type StepOfType<T extends StepType> = Extract<WorkflowStep, { type: T }>;

type _StepTypeMatchesWorkflowStepType = StepType extends WorkflowStep["type"]
    ? WorkflowStep["type"] extends StepType
        ? true
        : "WorkflowStep has a type not listed in STEP_TYPES — add it to STEP_TYPES"
    : "STEP_TYPES lists a type WorkflowStep does not produce — remove it";
const _stepTypeCheck: _StepTypeMatchesWorkflowStepType = true;
void _stepTypeCheck;

export function assertNeverStep(value: never): never {
    throw new Error(
        `Unreachable step type: ${typeof value === "string" ? value : "<unknown>"}. Every step type must be registered in STEP_TYPES and handled in every step-type-keyed map.`,
    );
}

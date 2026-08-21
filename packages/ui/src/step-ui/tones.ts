export const TONE_KEYS = [
    "start",
    "end",
    "tool-call",
    "llm-prompt",
    "extract-data",
    "switch-case",
    "for-each",
    "sleep",
    "while",
    "wait-for-condition",
    "agent-loop",
    "request-intervention",
] as const;

export type ToneKey = (typeof TONE_KEYS)[number];

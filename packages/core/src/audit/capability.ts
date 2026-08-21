import type { JSONSchema7Definition } from "json-schema";

export type ToolCallProvenance = "tool-call" | "agent-loop";

export type ToolCallSource = {
    provenance: ToolCallProvenance;
    inputSpace: JSONSchema7Definition;
    stepIds: string[];
};

export type WorkflowCapabilities = {
    toolCalls: {
        toolName: string;
        sources: ToolCallSource[];
    }[];
};

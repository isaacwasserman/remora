import type { JSONSchema7Definition } from "json-schema";

export type WorkflowCapabilities = {
    toolCalls: {
        toolName: string;
        inputSpace: JSONSchema7Definition;
    }[];
};

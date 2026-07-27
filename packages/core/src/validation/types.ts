import type { JSONSchema7Definition } from "json-schema";
import type { WorkflowDefinition } from "../schema";
import type { ResolvedRemoraflowOptions, ToolSet } from "../types";

export type ValidatorWarning = {
    severity: "warning";
    path?: PropertyKey[];
    message: string;
};

export type ValidatorError = {
    severity: "error";
    path?: PropertyKey[];
    message: string;
};

export type ValidatorDiagnostic = ValidatorWarning | ValidatorError;

export type ValidationContext = {
    tools: ToolSet;
    /**
     * Resolved rather than raw, so every module reads the same effective policy
     * the runtime will enforce instead of re-deriving defaults of its own.
     */
    options: ResolvedRemoraflowOptions;
};

export type ValidationModule = {
    id: string;
    failureMode: "continue" | "block";
    validate: (
        workflowDefinition: WorkflowDefinition,
        context: ValidationContext,
    ) => {
        correctedDefinition?: WorkflowDefinition;
        diagnostics: ValidatorDiagnostic[];
    };
};

export type RemoraflowType = JSONSchema7Definition;

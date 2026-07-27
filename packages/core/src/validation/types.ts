import type { JSONSchema7Definition } from "json-schema";
import type { WorkflowDefinition } from "../schema";
import type { ToolSet } from "../types";

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

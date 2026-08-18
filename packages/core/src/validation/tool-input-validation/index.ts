import { asSchema } from "ai";
import type { JSONSchema7, JSONSchema7Definition } from "json-schema";
import type { WorkflowStep } from "../../schema";
import {
    type SubsetDiagnostic,
    schemaSubsetDiagnostics,
} from "../../schemistry";
import {
    assertNeverStep,
    type StepOfType,
    type StepType,
} from "../../step-types";
import type { AnyTool, ToolSet } from "../../types";
import type {
    RemoraflowType,
    ValidationModule,
    ValidatorDiagnostic,
} from "../types";
import {
    buildScopeSnapshotsById,
    getExpressionType,
    type TypeScope,
} from "../variable-reference-validation";

function validateToolInput(
    scope: TypeScope,
    tool: AnyTool,
    toolName: string,
    input: (WorkflowStep & { type: "tool-call" })["params"]["toolInput"],
): SubsetDiagnostic[] {
    const resolvedParamTypes: Record<string, RemoraflowType> = {};
    for (const [paramKey, paramExpression] of Object.entries(input)) {
        resolvedParamTypes[paramKey] = getExpressionType(
            paramExpression,
            scope,
        );
    }
    const resolvedInputType: JSONSchema7Definition = {
        type: "object",
        properties: resolvedParamTypes,
        required: Object.keys(resolvedParamTypes),
        additionalProperties: false,
    };
    const toolInputSchema = asSchema(tool.inputSchema).jsonSchema;
    if (toolInputSchema instanceof Promise) {
        throw new Error(
            `Input schema for tool "${toolName}" was defined asynchronously. All tools must have synchronous schemas.`,
        );
    }
    return schemaSubsetDiagnostics(
        resolvedInputType,
        toolInputSchema as JSONSchema7Definition,
    );
}

type StepInputValidator<T extends StepType> = (args: {
    step: StepOfType<T>;
    stepIndex: number;
    tools: ToolSet;
    scopeSnapshot?: TypeScope;
}) => ValidatorDiagnostic[];

const STEP_INPUT_VALIDATORS: { [T in StepType]: StepInputValidator<T> } = {
    "tool-call": ({ step, stepIndex, tools, scopeSnapshot }) => {
        if (!scopeSnapshot) return [];
        const targetTool = tools[step.params.toolName];
        if (!targetTool) return [];
        const stepDiagnostics = validateToolInput(
            scopeSnapshot,
            targetTool,
            step.params.toolName,
            step.params.toolInput,
        );
        return stepDiagnostics.map((diagnostic) => ({
            severity: diagnostic.level,
            path: [
                "steps",
                stepIndex,
                "params",
                "toolInput",
                ...diagnostic.path,
            ],
            message: diagnostic.message,
        }));
    },
    "agent-loop": ({ step, stepIndex, tools }) => {
        const diagnostics: ValidatorDiagnostic[] = [];
        for (const [toolName, inputConstraint] of Object.entries(
            step.params.inputConstraints ?? [],
        )) {
            const targetTool = tools[toolName];
            if (!targetTool) continue;
            const toolSchema = asSchema(targetTool.inputSchema).jsonSchema;
            if (toolSchema instanceof Promise || "then" in toolSchema) {
                diagnostics.push({
                    severity: "error",
                    path: [
                        "steps",
                        stepIndex,
                        "params",
                        "inputConstraints",
                        toolName,
                    ],
                    message: `Input schema for tool "${toolName}" is defined asynchronously. All tools must use synchronously defined schemas.`,
                });
                continue;
            }
            const subsetDiagnostics = schemaSubsetDiagnostics(
                inputConstraint,
                toolSchema as JSONSchema7,
            );
            diagnostics.push(
                ...subsetDiagnostics.map((subsetDiagnostic) => ({
                    severity: subsetDiagnostic.level,
                    path: [
                        "steps",
                        stepIndex,
                        "params",
                        "inputConstraints",
                        toolName,
                        ...subsetDiagnostic.path,
                    ],
                    message: subsetDiagnostic.message,
                })),
            );
        }
        return diagnostics;
    },
    end: () => [],
    "extract-data": () => [],
    "for-each": () => [],
    "llm-prompt": () => [],
    "request-intervention": () => [],
    sleep: () => [],
    start: () => [],
    "switch-case": () => [],
    "wait-for-condition": () => [],
    while: () => [],
};

function validateStepInputs(
    step: WorkflowStep,
    stepIndex: number,
    tools: ToolSet,
    scopeSnapshot: TypeScope | undefined,
): ValidatorDiagnostic[] {
    const validator = STEP_INPUT_VALIDATORS[
        step.type
    ] as StepInputValidator<StepType>;
    return validator({ step, stepIndex, tools, scopeSnapshot });
}

export const toolInputValidator: ValidationModule = {
    id: "tool-input",
    failureMode: "continue",
    validate: (workflowDefinition, { tools }) => {
        const scopeSnapshots = buildScopeSnapshotsById(
            workflowDefinition,
            tools,
        );
        const diagnostics: ValidatorDiagnostic[] = [];

        for (const [stepIndex, step] of workflowDefinition.steps.entries()) {
            if (!step) continue;
            const scopeSnapshot = scopeSnapshots.byStepId.get(step.id);
            diagnostics.push(
                ...validateStepInputs(step, stepIndex, tools, scopeSnapshot),
            );
        }

        return { diagnostics };
    },
};

void assertNeverStep;

import { asSchema } from "ai";
import type { JSONSchema7, JSONSchema7Definition } from "json-schema";
import type { WorkflowStep } from "../../schema";
import {
    type SubsetDiagnostic,
    schemaSubsetDiagnostics,
} from "../../schemistry";
import type { AnyTool } from "../../types";
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
    // The call passes exactly these params, so treat the resolved input as a
    // closed object: a missing required param or an unexpected param is then a
    // definite error rather than merely possible.
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
            if (step.type === "tool-call") {
                const targetTool = tools[step.params.toolName];
                const scopeSnapshot = scopeSnapshots.byStepId.get(step.id);
                if (!targetTool || !scopeSnapshot) {
                    continue;
                }
                const stepDiagnostics = validateToolInput(
                    scopeSnapshot,
                    targetTool,
                    step.params.toolName,
                    step.params.toolInput,
                );
                for (const diagnostic of stepDiagnostics) {
                    diagnostics.push({
                        severity: diagnostic.level,
                        path: [
                            "steps",
                            stepIndex,
                            "params",
                            "toolInput",
                            ...diagnostic.path,
                        ],
                        message: diagnostic.message,
                    });
                }
            } else if (step.type === "agent-loop") {
                for (const [toolName, inputConstraint] of Object.entries(
                    step.params.inputConstraints ?? [],
                )) {
                    const targetTool = tools[toolName];
                    if (targetTool) {
                        const toolSchema = asSchema(
                            targetTool.inputSchema,
                        ).jsonSchema;
                        if ("then" in toolSchema) {
                            diagnostics.push({
                                severity: "error",
                                message: `Input schema for tool "${toolName}" is defined asynchronously. All tools must use synchronously defined schemas.`,
                            });
                        }
                        const subsetDiagnostics = schemaSubsetDiagnostics(
                            inputConstraint,
                            toolSchema as JSONSchema7,
                        );
                        diagnostics.push(
                            ...subsetDiagnostics.map((subsetDiagnostic) => ({
                                severity: subsetDiagnostic.level,
                                path: subsetDiagnostic.path,
                                message: subsetDiagnostic.message,
                            })),
                        );
                    }
                }
            }
        }

        return { diagnostics };
    },
};

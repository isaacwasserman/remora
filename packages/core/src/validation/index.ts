import type { WorkflowDefinition } from "../schema";
import {
    type RemoraflowSettings,
    remoraflowSettingsSchema,
    type StubbedToolSet,
} from "../types";
import { controlFlowValidator } from "./control-flow-validation";
import { expressionSyntaxValidator } from "./expression-syntax-validation";
import { outputSchemaValidator } from "./output-schema-validation";
import { structuralLimitValidator } from "./structural-limit-validation";
import { syntaxValidator } from "./syntax-validation";
import { createToolDefinitionValidator } from "./tool-definition-validation";
import { toolInputValidator } from "./tool-input-validation";
import { toolReferenceValidator } from "./tool-reference-validation";
import type {
    ValidationContext,
    ValidationModule,
    ValidatorDiagnostic,
} from "./types";
import { variableReferenceValidator } from "./variable-reference-validation";

function hasValidatorErrors(diagnostics: ValidatorDiagnostic[]): boolean {
    return (
        diagnostics?.some((diagnostic) => diagnostic.severity === "error") ??
        false
    );
}

export function validateWorkflowDefinition(
    workflowDefinition: WorkflowDefinition,
    {
        tools,
        options = remoraflowSettingsSchema.assert({}),
    }: { tools: StubbedToolSet; options?: RemoraflowSettings },
    toolAssertions: {
        assertToolsHaveExecutionFunctions: boolean;
        assertToolsHaveOutputSchemas: boolean;
    } = {
        assertToolsHaveExecutionFunctions: true,
        assertToolsHaveOutputSchemas: true,
    },
): {
    isValid: boolean;
    diagnostics: ValidatorDiagnostic[];
    correctedDefinition: WorkflowDefinition;
} {
    const resolvedOptions = remoraflowSettingsSchema.assert(options);
    const validationPipeline: ValidationModule[] = [
        syntaxValidator,
        controlFlowValidator,
        structuralLimitValidator,
        toolReferenceValidator,
        expressionSyntaxValidator,
        variableReferenceValidator,
        outputSchemaValidator,
        toolInputValidator,
        createToolDefinitionValidator(toolAssertions),
    ];

    const context: ValidationContext = { tools, options: resolvedOptions };
    let workingDefinition = workflowDefinition;
    const diagnostics: ValidatorDiagnostic[] = [];

    for (const validationPass of validationPipeline) {
        const {
            diagnostics: newDiagnostics,
            correctedDefinition: newCorrectedDefinition,
        } = validationPass.validate(workingDefinition, context);
        diagnostics.push(...newDiagnostics);
        if (newCorrectedDefinition) {
            workingDefinition = newCorrectedDefinition;
        }
        if (
            validationPass.failureMode === "block" &&
            hasValidatorErrors(diagnostics)
        ) {
            break;
        }
    }

    return {
        isValid: !hasValidatorErrors(diagnostics),
        diagnostics,
        correctedDefinition: workingDefinition,
    };
}

export {
    type ScopeBinding,
    scopeAt,
    scopeSchema,
    scopesByStepId,
} from "./scope-api";
export type {
    ValidatorDiagnostic,
    ValidatorError,
    ValidatorWarning,
} from "./types";

import type { WorkflowDefinition } from "../schema";
import { remoraflowOptionsSchema, type ToolSet } from "../types";
import { controlFlowValidator } from "./control-flow-validation";
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
        options = remoraflowOptionsSchema.assert({}),
    }: { tools: ToolSet; options?: ValidationContext["options"] },
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
    const validationPipeline: ValidationModule[] = [
        syntaxValidator,
        controlFlowValidator,
        toolReferenceValidator,
        variableReferenceValidator,
        toolInputValidator,
        createToolDefinitionValidator(toolAssertions),
    ];

    const context: ValidationContext = { tools, options };
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

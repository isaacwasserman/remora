import {
    createWorkflowDefinitionSchema,
    type WorkflowDefinition,
} from "../schema";
import { validateAgainstStandardSchema } from "../schemistry";
import type { ResolvedRemoraflowOptions, ToolSet } from "../types";
import { controlFlowValidator } from "./control-flow-validation";
import { syntaxValidator } from "./syntax-validation";
import { createToolDefinitionValidator } from "./tool-definition-validation";
import { toolInputValidator } from "./tool-input-validation";
import { toolReferenceValidator } from "./tool-reference-validation";
import type {
    ValidationModule,
    ValidatorDiagnostic,
    ValidatorWarning,
} from "./types";
import { variableReferenceValidator } from "./variable-reference-validation";

type SyntaxValidatorResult =
    | {
          validated: WorkflowDefinition;
          diagnostics: undefined | ValidatorWarning[];
      }
    | {
          validated: undefined;
          diagnostics: ValidatorDiagnostic[];
      };

function hasValidatorErrors(diagnostics: ValidatorDiagnostic[]): boolean {
    return (
        diagnostics?.some((diagnostic) => diagnostic.severity === "error") ??
        false
    );
}

function _validateWorkflowSyntax(
    workflowDefinition: unknown,
    options: ResolvedRemoraflowOptions,
): SyntaxValidatorResult {
    const { value, issues } = validateAgainstStandardSchema(
        workflowDefinition,
        createWorkflowDefinitionSchema(options).workflowDefinitionArktypeSchema,
    );
    if (value) {
        return { validated: value, diagnostics: undefined };
    }
    return {
        validated: undefined,
        diagnostics: issues.map((issue) => ({
            severity: "error",
            path: issue.path?.map((segment) =>
                typeof segment === "object" &&
                segment !== null &&
                "key" in segment
                    ? segment.key
                    : segment,
            ),
            message: `${issue.path ? `${JSON.stringify(issue.path)}: ` : ""}${issue.message}`,
        })),
    };
}

export function validateWorkflowDefinition(
    workflowDefinition: WorkflowDefinition,
    { tools }: { tools: ToolSet },
    options: {
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
        createToolDefinitionValidator(options),
    ];

    let workingDefinition = workflowDefinition;
    const diagnostics: ValidatorDiagnostic[] = [];

    for (const validationPass of validationPipeline) {
        const {
            diagnostics: newDiagnostics,
            correctedDefinition: newCorrectedDefinition,
        } = validationPass.validate(workingDefinition, { tools });
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

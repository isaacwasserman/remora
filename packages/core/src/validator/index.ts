import type { ToolSet } from "ai";
import { type WorkflowDefinition, workflowDefinitionSchema } from "../schema";
import { validateAgainstStandardSchema } from "../type-utils";
import { validateControlFlow } from "./control-flow-validation";
import { validateWorkflowToolNames } from "./tool-reference-validation";
import type {
    ValidationModule,
    ValidatorDiagnostic,
    ValidatorWarning,
} from "./types";
import { validateVariableReferences } from "./variable-reference-validation";

export type { Tool, ToolSet } from "ai";

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

function validateWorkflowSyntax(
    workflowDefinition: unknown,
): SyntaxValidatorResult {
    const { value, issues } = validateAgainstStandardSchema(
        workflowDefinition,
        workflowDefinitionSchema,
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
    unvalidatedWorkflowDefinition: unknown,
    options: { tools: ToolSet },
): { diagnostics: ValidatorDiagnostic[] } {
    const allDiagnostics: ValidatorDiagnostic[] = [];
    // Validate basic syntax
    const syntaxResult = validateWorkflowSyntax(unvalidatedWorkflowDefinition);
    allDiagnostics.push(...(syntaxResult.diagnostics ?? []));
    if (
        syntaxResult.diagnostics &&
        hasValidatorErrors(syntaxResult.diagnostics)
    ) {
        return {
            diagnostics: allDiagnostics,
        };
    }

    const workflowDefinition = syntaxResult.validated as WorkflowDefinition;

    // Ensure valid control flow
    const controlFlowResult = validateControlFlow(workflowDefinition);
    allDiagnostics.push(...controlFlowResult);
    if (hasValidatorErrors(controlFlowResult)) {
        return {
            diagnostics: allDiagnostics,
        };
    }

    // Ensure no references to nonexistent tools
    const toolReferenceDiagnostics = validateWorkflowToolNames(
        workflowDefinition,
        options.tools,
    );
    allDiagnostics.push(...toolReferenceDiagnostics);
    if (hasValidatorErrors(toolReferenceDiagnostics)) {
        return {
            diagnostics: allDiagnostics,
        };
    }

    // Ensure valid refernences
    const variableReferenceValidationDiagnostics = validateVariableReferences(
        workflowDefinition,
        options.tools,
    );
    allDiagnostics.push(...variableReferenceValidationDiagnostics);

    return {
        diagnostics: [],
    };
}

const _validationPipeline: ValidationModule[] = [];

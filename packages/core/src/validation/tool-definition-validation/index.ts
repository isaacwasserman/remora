import type { ValidationModule, ValidatorDiagnostic } from "../types";

export type ToolDefinitionValidatorOptions = {
    assertToolsHaveOutputSchemas?: boolean;
};

export function createToolDefinitionValidator(
    options: ToolDefinitionValidatorOptions,
): ValidationModule {
    const validationModule: ValidationModule = {
        id: "tool-definition",
        failureMode: "continue",
        validate: (_workflowDefinition, { tools }) => {
            const diagnostics: ValidatorDiagnostic[] = [];

            if (options.assertToolsHaveOutputSchemas) {
                const toolNamesWithoutOutputSchemas = Object.entries(tools)
                    .filter(
                        ([_toolName, toolDefinition]) =>
                            !toolDefinition.outputSchema,
                    )
                    .map(([toolName, _toolDefinition]) => toolName);
                diagnostics.push(
                    ...toolNamesWithoutOutputSchemas.map((toolName) => ({
                        severity: "warning" as const,
                        message: `Tool "${toolName}" is missing an output schema. Without an output schema, types cannot be properly inferred by the validator or the workflow author.`,
                    })),
                );
            }

            return { diagnostics };
        },
    };
    return validationModule;
}

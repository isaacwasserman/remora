import type { ValidationModule, ValidatorDiagnostic } from "../types";

export type ToolDefinitionValidatorOptions = {
    assertToolsHaveExecutionFunctions?: boolean;
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

            if (options.assertToolsHaveExecutionFunctions) {
                const toolsNamesWithoutExecutionFunctions = Object.entries(
                    tools,
                )
                    .filter(
                        ([_toolName, toolDefinition]) =>
                            !toolDefinition.execute,
                    )
                    .map(([toolName, _toolDefinition]) => toolName);
                diagnostics.push(
                    ...toolsNamesWithoutExecutionFunctions.map((toolName) => ({
                        severity: "error" as const,
                        message: `Tool "${toolName}" is missing an execution function. All tools must have execution functions.`,
                    })),
                );
            }
            if (options.assertToolsHaveOutputSchemas) {
                const toolsNamesWithoutExecutionFunctions = Object.entries(
                    tools,
                )
                    .filter(
                        ([_toolName, toolDefinition]) =>
                            !toolDefinition.outputSchema,
                    )
                    .map(([toolName, _toolDefinition]) => toolName);
                diagnostics.push(
                    ...toolsNamesWithoutExecutionFunctions.map((toolName) => ({
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

import { workflowDefinitionSchema } from "../../schema";
import { validateAgainstStandardSchema } from "../../schemistry";
import type { ValidationModule } from "../types";

export const syntaxValidator: ValidationModule = {
    id: "syntax",
    failureMode: "block",
    validate: (workflowDefinition) => {
        const { value, issues } = validateAgainstStandardSchema(
            workflowDefinition,
            workflowDefinitionSchema,
        );
        if (value) {
            return { correctedDefinition: value, diagnostics: [] };
        }
        return {
            correctedDefinition: value,
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
    },
};

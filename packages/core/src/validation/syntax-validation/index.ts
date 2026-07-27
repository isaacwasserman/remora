import {
    createWorkflowDefinitionSchema,
    type WorkflowDefinition,
} from "../../schema";
import { validateAgainstStandardSchema } from "../../schemistry";
import type { ValidationModule } from "../types";

export const syntaxValidator: ValidationModule = {
    id: "syntax",
    failureMode: "block",
    validate: (workflowDefinition, { options }) => {
        const { value, issues } = validateAgainstStandardSchema(
            workflowDefinition,
            createWorkflowDefinitionSchema(options)
                .workflowDefinitionArktypeSchema,
        );
        if (!issues) {
            return {
                correctedDefinition: value as WorkflowDefinition,
                diagnostics: [],
            };
        }
        return {
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

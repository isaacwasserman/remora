import type { JSONSchema7 } from "json-schema";
import { type SubsetDiagnostic, schemaSubsetDiagnostics } from "../schemistry";

export function requestedOutputSchemaDiagnostics(
    generated: JSONSchema7 | undefined,
    requested: JSONSchema7,
): SubsetDiagnostic[] {
    if (!generated) {
        return [
            {
                level: "error",
                path: ["outputSchema"],
                message:
                    "The generated workflow must declare an output schema.",
            },
        ];
    }

    return schemaSubsetDiagnostics(generated, requested);
}

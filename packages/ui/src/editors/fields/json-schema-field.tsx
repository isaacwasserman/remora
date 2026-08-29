import type { ValidatorDiagnostic } from "@remoraflow/core";
import type { JSONSchema7 } from "json-schema";
import { useCallback, useState } from "react";
import { JsonCodeEditor } from "../json-code-editor";
import { FieldRow } from "./field-row";

export interface JsonSchemaFieldProps {
    value: JSONSchema7;
    onChange: (value: JSONSchema7) => void;
    label: string;
    diagnostics: ValidatorDiagnostic[];
}

export function JsonSchemaField({
    value,
    onChange,
    label,
    diagnostics,
}: JsonSchemaFieldProps) {
    const [text, setText] = useState(() => JSON.stringify(value, null, 2));

    const handleChange = useCallback(
        (newText: string) => {
            setText(newText);
            try {
                const parsed = JSON.parse(newText);
                if (typeof parsed === "object" && parsed !== null) {
                    onChange(parsed as JSONSchema7);
                }
            } catch {
                // keep the text but don't propagate invalid JSON
            }
        },
        [onChange],
    );

    return (
        <FieldRow label={label} diagnostics={diagnostics}>
            <JsonCodeEditor value={text} onChange={handleChange} />
        </FieldRow>
    );
}

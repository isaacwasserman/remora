import type { ValidatorDiagnostic } from "@remoraflow/core";
import { CodeInput } from "../code-input";
import { FieldRow } from "./field-row";

export interface TemplateTextFieldProps {
    value: string;
    onChange: (value: string) => void;
    label: string;
    diagnostics: ValidatorDiagnostic[];
}

export function TemplateTextField({
    value,
    onChange,
    label,
    diagnostics,
}: TemplateTextFieldProps) {
    return (
        <FieldRow label={label} diagnostics={diagnostics}>
            <CodeInput
                value={value}
                onChange={onChange}
                multiline
                placeholder="Use ${stepId.key} for interpolation"
            />
        </FieldRow>
    );
}

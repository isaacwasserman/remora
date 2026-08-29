import type { ValidatorDiagnostic } from "@remoraflow/core";
import { TemplateCodeEditor } from "../template-code-editor";
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
            <TemplateCodeEditor
                value={value}
                onChange={onChange}
                placeholder="Use ${stepId.key} for interpolation"
            />
        </FieldRow>
    );
}

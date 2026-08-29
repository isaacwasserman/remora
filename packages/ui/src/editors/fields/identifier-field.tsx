import type { ValidatorDiagnostic } from "@remoraflow/core";
import { Input } from "../../components/ui/input";
import { FieldRow } from "./field-row";

export interface IdentifierFieldProps {
    value: string;
    onChange: (value: string) => void;
    label: string;
    diagnostics: ValidatorDiagnostic[];
    placeholder?: string;
}

export function IdentifierField({
    value,
    onChange,
    label,
    diagnostics,
    placeholder,
}: IdentifierFieldProps) {
    return (
        <FieldRow label={label} diagnostics={diagnostics}>
            <Input
                value={value ?? ""}
                onChange={(e) => onChange(e.target.value)}
                className="h-8 text-xs font-mono"
                placeholder={placeholder}
            />
        </FieldRow>
    );
}

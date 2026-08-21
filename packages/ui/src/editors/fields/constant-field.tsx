import type { ValidatorDiagnostic } from "@remoraflow/core";
import { FieldRow } from "./field-row";

export interface ConstantFieldProps {
    value: string;
    label: string;
    diagnostics: ValidatorDiagnostic[];
}

export function ConstantField({
    value,
    label,
    diagnostics,
}: ConstantFieldProps) {
    return (
        <FieldRow label={label} diagnostics={diagnostics}>
            <div className="text-xs text-muted-foreground font-mono px-2 py-1 bg-muted/40 rounded-md border border-border/50">
                {value}
            </div>
        </FieldRow>
    );
}

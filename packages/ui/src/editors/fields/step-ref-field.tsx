import type { ValidatorDiagnostic } from "@remoraflow/core";
import { StepIdDropdown } from "../shared-editors";
import { FieldRow } from "./field-row";

export interface StepRefFieldProps {
    value: string;
    onChange: (value: string) => void;
    label: string;
    diagnostics: ValidatorDiagnostic[];
    allStepIds: string[];
}

export function StepRefField({
    value,
    onChange,
    label,
    diagnostics,
    allStepIds,
}: StepRefFieldProps) {
    return (
        <FieldRow label={label} diagnostics={diagnostics}>
            <StepIdDropdown
                label={label}
                value={value ?? ""}
                onChange={onChange}
                stepIds={allStepIds}
                allowEmpty
            />
        </FieldRow>
    );
}

import type { ValidatorDiagnostic } from "@remoraflow/core";
import { FieldDiagnostics } from "../../panels/shared";
import { StepIdDropdown } from "../shared-editors";

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
        <div>
            <StepIdDropdown
                label={label}
                value={value ?? ""}
                onChange={onChange}
                stepIds={allStepIds}
                allowEmpty
            />
            <FieldDiagnostics diagnostics={diagnostics} />
        </div>
    );
}

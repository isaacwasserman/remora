import type { ValidatorDiagnostic } from "@remoraflow/core";
import { Switch } from "../../components/ui/switch";
import { FieldDiagnostics, Label } from "../../panels/shared";

export interface BooleanFieldProps {
    value: boolean;
    onChange: (value: boolean) => void;
    label: string;
    diagnostics: ValidatorDiagnostic[];
}

export function BooleanField({
    value,
    onChange,
    label,
    diagnostics,
}: BooleanFieldProps) {
    return (
        <div>
            <div className="flex items-center justify-between">
                <Label>{label}</Label>
                <Switch checked={value} onCheckedChange={onChange} />
            </div>
            <FieldDiagnostics diagnostics={diagnostics} />
        </div>
    );
}

import type { ValidatorDiagnostic } from "@remoraflow/core";
import type { ReactNode } from "react";
import { FieldDiagnostics, Label } from "../../panels/shared";

export interface FieldRowProps {
    label: string;
    blurb?: string;
    diagnostics: ValidatorDiagnostic[];
    children: ReactNode;
}

export function FieldRow({
    label,
    blurb,
    diagnostics,
    children,
}: FieldRowProps) {
    return (
        <div>
            <Label>{label}</Label>
            {blurb && (
                <p className="text-[10px] text-muted-foreground mb-1.5 leading-snug">
                    {blurb}
                </p>
            )}
            {children}
            <FieldDiagnostics diagnostics={diagnostics} />
        </div>
    );
}

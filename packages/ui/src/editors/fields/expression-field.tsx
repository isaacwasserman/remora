import type { Expression, ValidatorDiagnostic } from "@remoraflow/core";
import { ExpressionEditor } from "../expression-editor";

export interface ExpressionFieldProps {
    value: Expression;
    onChange: (value: Expression) => void;
    spec: {
        kind: "expression";
        label: string;
        allowJmespath?: boolean;
        allowTemplate?: boolean;
        schemaHint?: { type?: string; enum?: unknown[]; default?: unknown };
    };
    diagnostics: ValidatorDiagnostic[];
}

export function ExpressionField({
    value,
    onChange,
    spec,
    diagnostics,
}: ExpressionFieldProps) {
    return (
        <ExpressionEditor
            label={spec.label}
            value={value}
            onChange={onChange}
            schemaHint={spec.schemaHint}
            diagnostics={diagnostics}
        />
    );
}

import type { ValidatorDiagnostic } from "@remoraflow/core";
import { createContext, useContext, useMemo } from "react";
import { matchFieldDiagnostics } from "../utils/diagnostic-matching";

interface FieldDiagnosticsContextValue {
    diagnostics: ValidatorDiagnostic[];
}

const FieldDiagnosticsContext = createContext<FieldDiagnosticsContextValue>({
    diagnostics: [],
});

export function FieldDiagnosticsProvider({
    diagnostics,
    children,
}: {
    diagnostics: ValidatorDiagnostic[];
    children: React.ReactNode;
}) {
    const value = useMemo(() => ({ diagnostics }), [diagnostics]);
    return (
        <FieldDiagnosticsContext value={value}>
            {children}
        </FieldDiagnosticsContext>
    );
}

export function useFieldDiagnostics(
    fieldPath: PropertyKey[],
): ValidatorDiagnostic[] {
    const { diagnostics } = useContext(FieldDiagnosticsContext);
    return useMemo(
        () => matchFieldDiagnostics(diagnostics, fieldPath),
        [diagnostics, fieldPath],
    );
}

import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

type Severity = "error" | "warning";

export function SeverityNote({
    severity,
    children,
    className,
}: {
    severity: Severity;
    children: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "flex items-center gap-1.5 rounded px-1.5 py-1 text-left text-2xs",
                severity === "error"
                    ? "bg-status-danger/10 text-status-danger border border-status-danger/30"
                    : "bg-status-warning/10 text-status-warning border border-status-warning/30",
                className,
            )}
        >
            <span className="shrink-0 font-semibold">
                {severity === "error" ? "Error" : "Warn"}
            </span>
            <span className="leading-relaxed">{children}</span>
        </div>
    );
}

export function DiagnosticList({
    diagnostics,
    className,
}: {
    diagnostics: readonly { severity: string; message: string }[];
    className?: string;
}) {
    if (diagnostics.length === 0) return null;
    return (
        <div className={cn("stack-tight", className)}>
            {diagnostics.map((d) => (
                <SeverityNote
                    key={`${d.severity}-${d.message}`}
                    severity={d.severity === "error" ? "error" : "warning"}
                >
                    {d.message}
                </SeverityNote>
            ))}
        </div>
    );
}

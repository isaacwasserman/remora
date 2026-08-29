import type { StepType } from "@remoraflow/core";
import type React from "react";
import { STEP_UI } from "../step-ui/registry";
import { toneStyle } from "../step-ui/tone-styles";
import { FIELD_LABEL_TEXT, SECTION_HEADER_TEXT } from "../text-styles";

export function TypeBadge({ type }: { type: string }) {
    const ui = STEP_UI[type as StepType];
    if (!ui) {
        return (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {type}
            </span>
        );
    }
    const Icon = ui.icon;
    return (
        <span
            className="inline-flex items-center gap-1.5 shrink-0"
            style={toneStyle(ui.tone)}
        >
            <Icon className="w-3.5 h-3.5" />
            <span className="text-[10px] font-semibold uppercase tracking-wide">
                {ui.label}
            </span>
        </span>
    );
}

export function SectionHeader({ children }: { children: React.ReactNode }) {
    return <div className={SECTION_HEADER_TEXT}>{children}</div>;
}

export function Label({ children }: { children: React.ReactNode }) {
    return <div className={FIELD_LABEL_TEXT}>{children}</div>;
}

export function Code({ children }: { children: React.ReactNode }) {
    return (
        <pre className="text-xs rounded-md p-2.5 whitespace-pre-wrap font-mono overflow-auto max-h-[200px] text-foreground bg-muted/60 border border-border/50">
            {children}
        </pre>
    );
}

export function FieldDiagnostics({ diagnostics }: { diagnostics?: unknown[] }) {
    if (!diagnostics || diagnostics.length === 0) return null;
    return (
        <div className="space-y-1 mt-1.5 text-left">
            {(diagnostics as Array<{ severity: string; message: string }>).map(
                (d) => {
                    const isError = d.severity === "error";
                    return (
                        <div
                            key={`${d.severity}-${d.message}`}
                            className={
                                isError
                                    ? "flex gap-1.5 items-center text-[10px] text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30 rounded px-1.5 py-1 border border-red-200/80 dark:border-red-900/60 text-left"
                                    : "flex gap-1.5 items-center text-[10px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 rounded px-1.5 py-1 border border-amber-200/80 dark:border-amber-900/60 text-left"
                            }
                        >
                            <span className="shrink-0 font-semibold">
                                {isError ? "Error" : "Warn"}
                            </span>
                            <span className="leading-relaxed text-left">
                                {d.message}
                            </span>
                        </div>
                    );
                },
            )}
        </div>
    );
}

import type { ValidatorDiagnostic } from "@remoraflow/core";
import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils";
import { SeverityNote } from "./primitives/diagnostics";

export function WorkflowDiagnostics({
    diagnostics,
    bottomOffset = 12,
    onStepDiagnosticClick,
}: {
    diagnostics: readonly ValidatorDiagnostic[];
    /** Keeps the control clear of another bottom-right overlay, such as a minimap. */
    bottomOffset?: number;
    /** Opens the step associated with a diagnostic, when it has a step path. */
    onStepDiagnosticClick?: (stepIndex: number) => void;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen) return;
        const onPointerDown = (event: PointerEvent) => {
            if (!panelRef.current?.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("pointerdown", onPointerDown);
        return () => document.removeEventListener("pointerdown", onPointerDown);
    }, [isOpen]);

    if (diagnostics.length === 0) return null;

    const severity = diagnostics.some((d) => d.severity === "error")
        ? "error"
        : "warning";
    const badgeSeverityClasses =
        severity === "error"
            ? "border-status-danger/30 bg-status-danger-surface text-status-danger"
            : "border-status-warning/30 bg-status-warning-surface text-status-warning";

    return (
        <div
            ref={panelRef}
            className="absolute right-3 z-10 flex w-80 flex-col items-end"
            style={{ bottom: bottomOffset }}
        >
            {isOpen && (
                <section
                    aria-label="Diagnostics"
                    className="max-h-72 w-full overflow-y-auto rounded-md border border-border bg-card p-3 text-foreground shadow-md"
                >
                    <div className="mb-2 flex items-center justify-between text-xs font-semibold">
                        <span>Diagnostics</span>
                        <span>{diagnostics.length}</span>
                    </div>
                    <div className="stack-tight">
                        {diagnostics.map((diagnostic, index) => {
                            const stepIndex =
                                diagnostic.path?.[0] === "steps" &&
                                typeof diagnostic.path[1] === "number"
                                    ? diagnostic.path[1]
                                    : undefined;
                            const severity =
                                diagnostic.severity === "error"
                                    ? "error"
                                    : "warning";
                            const key = `${diagnostic.severity}-${index}-${diagnostic.message}`;

                            return stepIndex === undefined ||
                                !onStepDiagnosticClick ? (
                                <div key={key}>
                                    <SeverityNote severity={severity}>
                                        {diagnostic.message}
                                    </SeverityNote>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    key={key}
                                    className="w-full cursor-pointer text-left"
                                    onClick={() => {
                                        onStepDiagnosticClick(stepIndex);
                                        setIsOpen(false);
                                    }}
                                >
                                    <SeverityNote severity={severity}>
                                        {diagnostic.message}
                                    </SeverityNote>
                                </button>
                            );
                        })}
                    </div>
                </section>
            )}
            {!isOpen && (
                <button
                    type="button"
                    aria-label={`Show ${diagnostics.length} diagnostic${diagnostics.length === 1 ? "" : "s"}`}
                    aria-expanded={false}
                    data-severity={severity}
                    onClick={() => setIsOpen(true)}
                    className={cn(
                        "rounded-md border px-2.5 py-1.5 text-xs font-semibold shadow-md transition-opacity hover:opacity-90",
                        badgeSeverityClasses,
                    )}
                >
                    {diagnostics.length}
                </button>
            )}
        </div>
    );
}

import type { ValidatorDiagnostic, WorkflowStep } from "@remoraflow/core";
import { ReadOnlyStepParams } from "../editors/fields/read-only-step-params";
import { JsonViewer } from "../editors/json-viewer";
import type { StepExecutionSummary } from "../execution-state";
import { stepLevelDiagnostics } from "../utils/diagnostic-matching";
import { Label, SectionHeader, TypeBadge } from "./shared";

function jsonString(value: unknown): string {
    return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

export interface StepDetailPanelProps {
    step: WorkflowStep;
    diagnostics: ValidatorDiagnostic[];
    executionSummary?: StepExecutionSummary;
    renderedParams?: Record<string, unknown>;
    workflowInputSchema?: object;
    workflowOutputSchema?: object;
    onClose: () => void;
}

function StatusBadge({ summary }: { summary: StepExecutionSummary }) {
    const colors: Record<string, string> = {
        pending: "bg-muted text-muted-foreground border border-border",
        running: "bg-blue-500/10 text-blue-600 border border-blue-500/20",
        completed: "bg-green-500/10 text-green-600 border border-green-500/20",
        failed: "bg-destructive/10 text-destructive border border-destructive/20",
    };
    return (
        <span
            className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${colors[summary.status]}`}
        >
            {summary.status}
        </span>
    );
}

export function StepDetailPanel({
    step,
    diagnostics,
    executionSummary,
    renderedParams,
    workflowInputSchema,
    workflowOutputSchema,
    onClose,
}: StepDetailPanelProps) {
    return (
        <div className="w-[360px] border-l h-full min-h-0 overflow-y-auto bg-card border-border">
            <div className="sticky top-0 z-10 border-b px-4 py-3 flex items-center justify-between bg-card/95 backdrop-blur-sm border-border">
                <TypeBadge type={step.type} />
                <button
                    type="button"
                    onClick={onClose}
                    className="text-lg leading-none text-muted-foreground hover:text-foreground shrink-0 rounded-md w-7 h-7 flex items-center justify-center hover:bg-muted transition-colors"
                >
                    &times;
                </button>
            </div>

            <div className="px-4 py-4 space-y-4">
                <div className="space-y-3">
                    <div>
                        <div className="font-medium text-sm text-foreground">
                            {step.name}
                        </div>
                        {step.description && (
                            <div className="text-xs text-muted-foreground leading-relaxed mt-1">
                                {step.description}
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label>Step ID</Label>
                            <div className="text-xs font-mono text-muted-foreground bg-muted/40 rounded px-2 py-1.5 truncate">
                                {step.id}
                            </div>
                        </div>
                        {step.nextStepId && (
                            <div>
                                <Label>Next Step</Label>
                                <div className="text-xs font-mono text-muted-foreground bg-muted/40 rounded px-2 py-1.5 truncate">
                                    {step.nextStepId}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="border-t pt-4 border-border">
                    <SectionHeader>Parameters</SectionHeader>
                    <div className="mt-2">
                        <ReadOnlyStepParams
                            step={step}
                            diagnostics={diagnostics}
                        />
                    </div>
                </div>

                {step.type === "start" && workflowInputSchema && (
                    <div className="border-t pt-4 border-border">
                        <SectionHeader>Input Schema</SectionHeader>
                        <div className="mt-2">
                            <JsonViewer
                                value={JSON.stringify(
                                    workflowInputSchema,
                                    null,
                                    2,
                                )}
                            />
                        </div>
                    </div>
                )}

                {step.type === "end" && workflowOutputSchema && (
                    <div className="border-t pt-4 border-border">
                        <SectionHeader>Output Schema</SectionHeader>
                        <div className="mt-2">
                            <JsonViewer
                                value={JSON.stringify(
                                    workflowOutputSchema,
                                    null,
                                    2,
                                )}
                            />
                        </div>
                    </div>
                )}

                {executionSummary && (
                    <div className="border-t border-border pt-4">
                        <SectionHeader>Execution</SectionHeader>
                        <div className="mt-2 space-y-3">
                            <div className="flex items-center gap-2 flex-wrap">
                                <StatusBadge summary={executionSummary} />
                                {executionSummary.executionCount > 1 && (
                                    <span className="text-[11px] text-muted-foreground">
                                        ({executionSummary.executionCount}{" "}
                                        executions)
                                    </span>
                                )}
                            </div>

                            {renderedParams && (
                                <div>
                                    <Label>Rendered Parameters</Label>
                                    <JsonViewer
                                        value={jsonString(renderedParams)}
                                    />
                                </div>
                            )}

                            <div>
                                <Label>Output</Label>
                                <JsonViewer
                                    value={
                                        executionSummary.latestOutput !==
                                        undefined
                                            ? jsonString(
                                                  executionSummary.latestOutput,
                                              )
                                            : undefined
                                    }
                                />
                            </div>

                            {executionSummary.latestError && (
                                <div className="text-xs p-2.5 rounded-md bg-destructive/10 text-destructive border border-destructive/20">
                                    <div className="font-semibold font-mono">
                                        {executionSummary.latestError.code}
                                    </div>
                                    <div className="mt-1 leading-relaxed">
                                        {executionSummary.latestError.message}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {stepLevelDiagnostics(diagnostics).length > 0 && (
                    <div className="border-t pt-4 border-border">
                        <SectionHeader>Diagnostics</SectionHeader>
                        <div className="space-y-2 mt-2">
                            {stepLevelDiagnostics(diagnostics).map((d, i) => (
                                <div
                                    key={`${d.severity}-${i}-${d.message}`}
                                    className={`text-xs p-2.5 rounded-md ${
                                        d.severity === "error"
                                            ? "bg-destructive/10 text-destructive border border-destructive/20"
                                            : "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                                    }`}
                                >
                                    <div className="font-semibold font-mono">
                                        {d.severity}
                                    </div>
                                    <div className="mt-1 leading-relaxed">
                                        {d.message}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

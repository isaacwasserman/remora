import type {
    StepExecutionRecord,
    ValidatorDiagnostic,
    WorkflowStep,
} from "@remoraflow/core";
import { CircleQuestionMark } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { ReadOnlyStepParams } from "../editors/fields/read-only-step-params";
import { JsonViewer } from "../editors/json-viewer";
import type { StepExecutionSummary } from "../execution-state";
import { BODY_TEXT, MUTED_TEXT } from "../text-styles";
import { stepLevelDiagnostics } from "../utils/diagnostic-matching";
import { Label, SectionHeader, TypeBadge } from "./shared";

const DEFAULT_WIDTH = 360;
const MIN_WIDTH = 260;
const MAX_WIDTH = 800;

function jsonString(value: unknown): string {
    return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

export interface StepDetailPanelProps {
    step: WorkflowStep;
    diagnostics: ValidatorDiagnostic[];
    executionSummary?: StepExecutionSummary;
    executions?: StepExecutionRecord[];
    onExecutionPathHover?: (executionId: string) => void;
    onExecutionPathLeave?: () => void;
    workflowInputSchema?: object;
    workflowOutputSchema?: object;
    onClose: () => void;
}

function StatusBadge({ status }: { status: StepExecutionRecord["status"] }) {
    const colors: Record<string, string> = {
        pending: "bg-muted text-muted-foreground border border-border",
        running: "bg-blue-500/10 text-blue-600 border border-blue-500/20",
        completed: "bg-green-500/10 text-green-600 border border-green-500/20",
        failed: "bg-destructive/10 text-destructive border border-destructive/20",
    };
    return (
        <span
            className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${colors[status]}`}
        >
            {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
    );
}

export function StepDetailPanel({
    step,
    diagnostics,
    executionSummary,
    executions,
    onExecutionPathHover,
    onExecutionPathLeave,
    workflowInputSchema,
    workflowOutputSchema,
    onClose,
}: StepDetailPanelProps) {
    const [width, setWidth] = useState(DEFAULT_WIDTH);
    const dragState = useRef<{ startX: number; startWidth: number } | null>(
        null,
    );

    const onPointerDown = useCallback(
        (e: React.PointerEvent) => {
            e.preventDefault();
            dragState.current = { startX: e.clientX, startWidth: width };
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        },
        [width],
    );

    const onPointerMove = useCallback((e: React.PointerEvent) => {
        if (!dragState.current) return;
        const delta = dragState.current.startX - e.clientX;
        setWidth(
            Math.min(
                MAX_WIDTH,
                Math.max(MIN_WIDTH, dragState.current.startWidth + delta),
            ),
        );
    }, []);

    const onPointerUp = useCallback(() => {
        dragState.current = null;
    }, []);

    return (
        <div
            className="border-l h-full min-h-0 flex bg-card border-border"
            style={{ width }}
        >
            <div
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                className="w-1.5 shrink-0 cursor-ew-resize"
            />
            <div className="flex-1 min-w-0 overflow-y-auto">
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
                            <Label>Name</Label>
                            <div className={BODY_TEXT}>{step.name}</div>
                            {step.description && (
                                <div className="mt-3">
                                    <Label>Description</Label>
                                    <div className={BODY_TEXT}>
                                        {step.description}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label>Step ID</Label>
                                <div className="rounded bg-muted/40 px-2 py-1.5 font-mono text-sm text-foreground truncate">
                                    {step.id}
                                </div>
                            </div>
                            {step.nextStepId && (
                                <div>
                                    <Label>Next Step</Label>
                                    <div className="rounded bg-muted/40 px-2 py-1.5 font-mono text-sm text-foreground truncate">
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
                            <div className="text-base font-semibold text-foreground">
                                Execution history
                            </div>
                            <div className="mt-2 space-y-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                    {executionSummary.executionCount > 1 && (
                                        <span className={MUTED_TEXT}>
                                            ({executionSummary.executionCount}{" "}
                                            executions)
                                        </span>
                                    )}
                                </div>

                                {executions?.map((execution, index) => (
                                    <div
                                        key={execution.executionId}
                                        className={`space-y-2 ${index > 0 ? "border-t pt-3 border-border" : ""}`}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <div
                                                className={`flex items-center gap-1.5 font-semibold ${BODY_TEXT}`}
                                            >
                                                <span>
                                                    Execution {index + 1}
                                                </span>
                                                <button
                                                    type="button"
                                                    aria-label="Highlight execution path"
                                                    className="cursor-help text-muted-foreground transition-colors hover:text-foreground"
                                                    onMouseEnter={() =>
                                                        onExecutionPathHover?.(
                                                            execution.executionId,
                                                        )
                                                    }
                                                    onMouseLeave={
                                                        onExecutionPathLeave
                                                    }
                                                    onFocus={() =>
                                                        onExecutionPathHover?.(
                                                            execution.executionId,
                                                        )
                                                    }
                                                    onBlur={
                                                        onExecutionPathLeave
                                                    }
                                                >
                                                    <CircleQuestionMark className="size-3" />
                                                </button>
                                            </div>
                                            <StatusBadge
                                                status={execution.status}
                                            />
                                        </div>
                                        {execution.renderedParams && (
                                            <div>
                                                <Label>
                                                    Rendered Parameters
                                                </Label>
                                                <JsonViewer
                                                    value={jsonString(
                                                        execution.renderedParams,
                                                    )}
                                                />
                                            </div>
                                        )}
                                        {execution.state !== undefined && (
                                            <div>
                                                <Label>State</Label>
                                                <JsonViewer
                                                    value={jsonString(
                                                        execution.state,
                                                    )}
                                                />
                                            </div>
                                        )}
                                        {execution.output !== undefined && (
                                            <div>
                                                <Label>Output</Label>
                                                <JsonViewer
                                                    value={jsonString(
                                                        execution.output,
                                                    )}
                                                />
                                            </div>
                                        )}
                                        {execution.error && (
                                            <div className="text-xs p-2.5 rounded-md bg-destructive/10 text-destructive border border-destructive/20">
                                                <div className="font-semibold font-mono">
                                                    {execution.error.code}
                                                </div>
                                                <div className="mt-1 leading-relaxed">
                                                    {execution.error.message}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {stepLevelDiagnostics(diagnostics).length > 0 && (
                        <div className="border-t pt-4 border-border">
                            <SectionHeader>Diagnostics</SectionHeader>
                            <div className="space-y-2 mt-2">
                                {stepLevelDiagnostics(diagnostics).map(
                                    (d, i) => (
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
                                    ),
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

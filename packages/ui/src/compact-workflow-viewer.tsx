import type {
    ExecutionState,
    StepType,
    ValidatorDiagnostic,
    WorkflowDefinition,
    WorkflowStep,
} from "@remoraflow/core";
import {
    ChevronRight,
    CircleAlert,
    CornerDownRight,
    TriangleAlert,
} from "lucide-react";
import { type CSSProperties, useMemo, useState } from "react";
import {
    buildStepList,
    type CompactEntry,
} from "./compact-viewer/build-step-list";
import { StepDetails } from "./compact-viewer/step-details";
import {
    deriveStepSummaries,
    type StepExecutionSummary,
} from "./execution-state";
import { EMPTY_DIAGNOSTICS } from "./hooks/use-selection-state";
import { StatusIcon } from "./nodes/node-shell";
import { NodeRow, renderFieldSummary } from "./nodes/step-node";
import { STEP_UI } from "./step-ui/registry";
import { toneColor } from "./step-ui/tone-styles";
import type { FieldKind } from "./step-ui/types";

/** Props for the {@link CompactWorkflowViewer} component. */
export type CompactWorkflowViewerProps = {
    /** The workflow definition to list. */
    workflow: WorkflowDefinition | null;
    /** Compiler diagnostics to display on affected steps. */
    diagnostics?: ValidatorDiagnostic[];
    /** Called when a step is clicked (with the step and its diagnostics) or when the selection is cleared (with `null`). */
    onStepSelect?: (
        step: WorkflowStep | null,
        diagnostics: ValidatorDiagnostic[],
    ) => void;
    /** Execution state to visualize on the steps. */
    executionState?: ExecutionState;
    /** Whether the workflow execution is currently paused. */
    paused?: boolean;
    className?: string;
};

const STATUS_RING: Record<string, string> = {
    running: "ring-1 ring-inset ring-status-running",
    completed: "ring-1 ring-inset ring-status-success",
    failed: "ring-1 ring-inset ring-status-danger",
};

interface ListContext {
    workflow: WorkflowDefinition;
    diagnostics: ValidatorDiagnostic[];
    summaries: Map<string, StepExecutionSummary> | undefined;
    paused: boolean;
    selectedStepId: string | null;
    onToggle: (step: WorkflowStep, diagnostics: ValidatorDiagnostic[]) => void;
}

function EntryList({
    entries,
    context,
}: {
    entries: CompactEntry[];
    context: ListContext;
}) {
    return (
        <div className="flex flex-col divide-y divide-border">
            {entries.map((entry) =>
                entry.kind === "step" ? (
                    <StepEntry
                        key={entry.step.id}
                        entry={entry}
                        context={context}
                    />
                ) : (
                    <div
                        key={`jump:${entry.targetStepId}`}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground"
                    >
                        <CornerDownRight className="size-3.5" />
                        Continues at
                        <span className="font-medium">
                            {context.workflow.steps.find(
                                (step) => step.id === entry.targetStepId,
                            )?.name ?? entry.targetStepId}
                        </span>
                    </div>
                ),
            )}
        </div>
    );
}

function StepEntry({
    entry: { step, chains },
    context,
}: {
    entry: Extract<CompactEntry, { kind: "step" }>;
    context: ListContext;
}) {
    const ui = STEP_UI[step.type as StepType];
    const Icon = ui.icon;
    const fields = ui.fields as Record<
        string,
        { kind: FieldKind; label: string }
    >;
    const params = (step as { params?: Record<string, unknown> }).params;
    const stepIndex = context.workflow.steps.indexOf(step);
    const diagnostics = context.diagnostics.filter(
        (d) => d.path?.[0] === "steps" && d.path[1] === stepIndex,
    );
    const severity = (["error", "warning"] as const).find((level) =>
        diagnostics.some((d) => d.severity === level),
    );
    const SeverityIcon = severity === "error" ? CircleAlert : TriangleAlert;
    const status = context.summaries?.get(step.id)?.status;
    const expanded = context.selectedStepId === step.id;

    return (
        <div
            data-step-id={step.id}
            style={{ "--step-tone": toneColor(ui.tone) } as CSSProperties}
        >
            <button
                type="button"
                aria-expanded={expanded}
                onClick={() => context.onToggle(step, diagnostics)}
                className={`block w-full px-3 py-2 text-left transition-colors ${expanded ? "bg-[color-mix(in_oklab,var(--step-tone)_18%,var(--color-card))]" : "bg-[color-mix(in_oklab,var(--step-tone)_12%,var(--color-card))] hover:bg-[color-mix(in_oklab,var(--step-tone)_18%,var(--color-card))]"} ${STATUS_RING[status ?? ""] ?? ""}`}
            >
                <div className="flex items-center gap-2">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-sm bg-(--step-tone) text-white">
                        <Icon className="size-3.5" />
                    </span>
                    <span className="truncate text-sm font-medium text-foreground">
                        {step.name}
                    </span>
                    <span className="truncate font-mono text-[11px] text-muted-foreground">
                        {step.id}
                    </span>
                    <span className="ml-auto flex shrink-0 items-center gap-2">
                        {severity && (
                            <span
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-card ${severity === "error" ? "bg-status-danger" : "bg-status-warning"}`}
                            >
                                <SeverityIcon className="size-3" />
                                {diagnostics.length} {severity}
                                {diagnostics.length === 1 ? "" : "s"}
                            </span>
                        )}
                        <span className="rounded-full bg-[color-mix(in_oklab,var(--step-tone)_22%,var(--color-card))] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-(--step-tone)">
                            {ui.label}
                        </span>
                        {status && (
                            <StatusIcon
                                status={status}
                                paused={context.paused}
                            />
                        )}
                        <ChevronRight
                            className={`size-4 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`}
                        />
                    </span>
                </div>
                <div className="mt-0.5 pl-7 text-[11px] text-muted-foreground">
                    {step.description}
                    {!expanded &&
                        params &&
                        ui.nodeRows?.map((key) => (
                            <NodeRow
                                key={key}
                                label={fields[key]?.label.toLowerCase() ?? key}
                                value={renderFieldSummary(
                                    fields[key]?.kind ?? "constant",
                                    params[key],
                                )}
                            />
                        ))}
                </div>
            </button>
            {expanded && (
                <div className="max-h-80 overflow-y-auto bg-[color-mix(in_oklab,var(--step-tone)_18%,var(--color-card))] pt-1 pr-3 pb-3 pl-10">
                    <StepDetails
                        step={step}
                        diagnostics={diagnostics}
                        executionSummary={context.summaries?.get(step.id)}
                        workflow={context.workflow}
                    />
                </div>
            )}
            {chains.map((chain) => (
                <div
                    key={chain.label}
                    className="border-t border-border bg-[color-mix(in_oklab,var(--step-tone)_8%,var(--color-card))]"
                >
                    <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-(--step-tone)">
                        {chain.label}
                    </div>
                    <div className="ml-3 border-l-2 border-(--step-tone)">
                        <EntryList entries={chain.entries} context={context} />
                    </div>
                </div>
            ))}
        </div>
    );
}

/**
 * Read-only list view of a workflow. Steps are stacked in execution order and
 * the steps nested in loops, conditions, and switch cases are grouped under
 * their parent step. Clicking a step unfolds its details.
 */
export function CompactWorkflowViewer({
    workflow,
    diagnostics = EMPTY_DIAGNOSTICS,
    onStepSelect,
    executionState,
    paused = false,
    className = "",
}: CompactWorkflowViewerProps) {
    const stepList = useMemo(
        () => (workflow ? buildStepList(workflow) : undefined),
        [workflow],
    );
    const summaries = useMemo(
        () => executionState && deriveStepSummaries(executionState),
        [executionState],
    );
    const [selectedStepId, setSelectedStepId] = useState<string | null>(null);

    if (!workflow || !stepList) return null;

    const context: ListContext = {
        workflow,
        diagnostics,
        summaries,
        paused,
        selectedStepId,
        onToggle: (step, stepDiagnostics) => {
            const deselect = step.id === selectedStepId;
            setSelectedStepId(deselect ? null : step.id);
            onStepSelect?.(
                deselect ? null : step,
                deselect ? [] : stepDiagnostics,
            );
        },
    };

    return (
        <div
            className={`flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4 ${className}`}
        >
            {[stepList.entries, ...stepList.unreachable].map(
                (entries, index) => (
                    <div
                        key={
                            entries[0]?.kind === "step"
                                ? entries[0].step.id
                                : index
                        }
                        className="shrink-0 overflow-hidden rounded-md border border-border bg-card"
                    >
                        {index > 0 && (
                            <div className="border-b border-border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Unreachable steps
                            </div>
                        )}
                        <EntryList entries={entries} context={context} />
                    </div>
                ),
            )}
        </div>
    );
}

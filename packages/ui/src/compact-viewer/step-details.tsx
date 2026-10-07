import {
    describeJsonSchemaType,
    type Expression,
    type StepType,
    type ValidatorDiagnostic,
    type WorkflowDefinition,
    type WorkflowStep,
} from "@remoraflow/core";
import type { JSONSchema7 } from "json-schema";
import { CircleAlert, TriangleAlert } from "lucide-react";
import type { StepExecutionSummary } from "../execution-state";
import type { SwitchCase } from "../step-ui/field-kinds";
import { STEP_UI } from "../step-ui/registry";
import type { FieldKind } from "../step-ui/types";
import {
    matchFieldDiagnostics,
    stepLevelDiagnostics,
} from "../utils/diagnostic-matching";
import { formatExpression } from "../utils/expression-display";

type Issue = Pick<ValidatorDiagnostic, "severity" | "message">;

interface DetailRow {
    label: string;
    value?: string;
    issues?: Issue[];
}

function formatValue(kind: FieldKind, value: unknown): string {
    switch (kind) {
        case "expression":
            return formatExpression(value as Expression);
        case "tool-ref-list":
            return (value as string[]).join(", ");
        case "json-schema":
            return describeJsonSchemaType(value as JSONSchema7);
        case "schema-map":
        case "expression-map":
            return Object.entries(value as Record<string, unknown>)
                .map(([key, entry]) =>
                    kind === "schema-map"
                        ? `${key}: ${describeJsonSchemaType(entry as JSONSchema7)}`
                        : `${key} = ${formatExpression(entry as Expression)}`,
                )
                .join("\n");
        case "case-list":
            return (value as SwitchCase[])
                .map(
                    (c) =>
                        `${c.value.type === "default" ? "default" : formatExpression(c.value as Expression)} → ${c.branchBodyStepId}`,
                )
                .join("\n");
        default:
            return typeof value === "string" ? value : JSON.stringify(value);
    }
}

function DetailField({ label, value, issues = [] }: DetailRow) {
    return (
        <>
            <dt className="py-1 text-muted-foreground">
                {label.charAt(0).toUpperCase() + label.slice(1).toLowerCase()}
            </dt>
            <dd className="min-w-0">
                {value !== undefined && (
                    <pre className="w-fit max-w-full max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[color-mix(in_oklab,var(--step-tone)_4%,var(--color-card))] px-2 py-1 font-mono text-foreground">
                        {value}
                    </pre>
                )}
                {issues.map((issue) => {
                    const Icon =
                        issue.severity === "error"
                            ? CircleAlert
                            : TriangleAlert;
                    return (
                        <div
                            key={issue.message}
                            className={`mt-0.5 flex gap-1 ${issue.severity === "error" ? "text-status-danger" : "text-status-warning"}`}
                        >
                            <Icon className="mt-0.5 size-3 shrink-0" />
                            {issue.message}
                        </div>
                    );
                })}
            </dd>
        </>
    );
}

/** Read-only parameters, diagnostics, and runs of a step, laid out as a dense list. */
export function StepDetails({
    step,
    diagnostics,
    executionSummary,
    workflow,
}: {
    step: WorkflowStep;
    diagnostics: ValidatorDiagnostic[];
    executionSummary?: StepExecutionSummary;
    workflow: WorkflowDefinition;
}) {
    const ui = STEP_UI[step.type as StepType];
    const fields = ui.fields as Record<
        string,
        {
            kind: FieldKind;
            label: string;
            renderIf?: (step: unknown) => boolean;
        }
    >;
    const params = (step as { params?: Record<string, unknown> }).params ?? {};
    const workflowSchema =
        step.type === "start" ? workflow.inputSchema : workflow.outputSchema;

    const rows: DetailRow[] = (ui.order as readonly string[])
        .filter(
            (key) =>
                params[key] != null && (fields[key]?.renderIf?.(step) ?? true),
        )
        .map((key) => ({
            label: fields[key]?.label ?? key,
            value: formatValue(fields[key]?.kind ?? "constant", params[key]),
            issues: matchFieldDiagnostics(diagnostics, ["params", key]),
        }));
    if ((step.type === "start" || step.type === "end") && workflowSchema) {
        rows.push({
            label: `${step.type === "start" ? "Input" : "Output"} schema`,
            value: describeJsonSchemaType(workflowSchema as JSONSchema7),
        });
    }
    if (step.nextStepId) {
        rows.push({ label: "Next step", value: step.nextStepId });
    }
    const stepIssues = stepLevelDiagnostics(diagnostics);
    if (stepIssues.length > 0)
        rows.push({ label: "Issues", issues: stepIssues });
    executionSummary?.executions.forEach((execution, index) => {
        rows.push({
            label: `Run ${index + 1} (${execution.status})`,
            value:
                execution.output === undefined
                    ? undefined
                    : JSON.stringify(execution.output, null, 2),
            issues: execution.error
                ? [{ severity: "error", message: execution.error.message }]
                : [],
        });
    });

    return (
        <dl className="grid grid-cols-[max-content_minmax(0,1fr)] items-start gap-x-4 gap-y-1.5 text-[11px] leading-snug">
            {rows.map((row) => (
                <DetailField key={row.label} {...row} />
            ))}
        </dl>
    );
}

import type {
    Expression,
    StepType,
    ValidatorDiagnostic,
    WorkflowStep,
} from "@remoraflow/core";
import type { JSONSchema7 } from "json-schema";
import type { SwitchCase } from "../../step-ui/field-kinds";
import { STEP_UI } from "../../step-ui/registry";
import type { FieldKind } from "../../step-ui/types";
import { matchFieldDiagnostics } from "../../utils/diagnostic-matching";
import { formatExpression } from "../../utils/expression-display";
import { JsonViewer } from "../json-viewer";

type LooseFieldSpec = {
    kind: FieldKind;
    label: string;
    renderIf?: (step: unknown) => boolean;
};

function Code({ children }: { children: React.ReactNode }) {
    return (
        <pre className="text-xs rounded-md p-2.5 whitespace-pre-wrap font-mono overflow-auto max-h-[200px] text-foreground bg-muted/60 border border-border/50">
            {children}
        </pre>
    );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
    return (
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            {children}
        </div>
    );
}

function ResolvedCode({
    value,
    expression,
}: {
    value: unknown;
    expression?: string;
}) {
    const display =
        typeof value === "string" ? value : JSON.stringify(value, null, 2);
    if (typeof value === "string") {
        return (
            <pre
                className="text-xs text-emerald-600 bg-emerald-500/10 rounded-md p-2.5 whitespace-pre-wrap font-mono overflow-auto max-h-[200px] cursor-default border border-emerald-500/20"
                title={expression}
            >
                {display}
            </pre>
        );
    }
    return <JsonViewer value={display} />;
}

function FieldDiagnostics({ diagnostics }: { diagnostics?: unknown[] }) {
    if (!diagnostics || diagnostics.length === 0) return null;
    return (
        <div className="space-y-1 mt-1.5 text-left">
            {(diagnostics as Array<{ severity: string; message: string }>).map(
                (d, i) => {
                    const isError = d.severity === "error";
                    return (
                        <div
                            key={`${d.severity}-${i}`}
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

function renderReadOnlyValue(
    kind: FieldKind,
    value: unknown,
    resolvedValue: unknown,
    _label: string,
): React.ReactNode {
    const hasResolved = resolvedValue !== undefined;

    switch (kind) {
        case "expression": {
            const expr = value as Expression | undefined;
            if (!expr) return <Code>—</Code>;
            if (hasResolved) {
                return (
                    <ResolvedCode
                        value={resolvedValue}
                        expression={formatExpression(expr)}
                    />
                );
            }
            return <Code>{formatExpression(expr)}</Code>;
        }
        case "template-text": {
            const text = value as string | undefined;
            if (hasResolved) {
                return <ResolvedCode value={resolvedValue} expression={text} />;
            }
            return (
                <pre className="text-xs rounded p-2 whitespace-pre-wrap font-mono text-foreground bg-muted">
                    {text || "—"}
                </pre>
            );
        }
        case "identifier":
        case "step-ref":
            return <Code>{(value as string) || "— none —"}</Code>;
        case "tool-ref":
            return (
                <div className="text-xs font-mono font-medium text-foreground bg-muted/40 rounded px-2 py-1 inline-block">
                    {(value as string) || "— none —"}
                </div>
            );
        case "tool-ref-list": {
            const tools = value as readonly string[] | undefined;
            if (!tools?.length) return <Code>—</Code>;
            return <Code>{tools.join(", ")}</Code>;
        }
        case "json-schema":
            return (
                <JsonViewer
                    value={JSON.stringify(value as JSONSchema7, null, 2)}
                />
            );
        case "schema-map": {
            const map = value as Record<string, JSONSchema7> | undefined;
            if (!map || Object.keys(map).length === 0) return null;
            return (
                <div className="space-y-2">
                    {Object.entries(map).map(([key, schema]) => (
                        <div key={key}>
                            <div className="text-xs font-mono font-medium text-muted-foreground mb-1">
                                {key}
                            </div>
                            <JsonViewer
                                value={JSON.stringify(schema, null, 2)}
                            />
                        </div>
                    ))}
                </div>
            );
        }
        case "expression-map": {
            const inputs = value as Record<string, Expression> | undefined;
            if (!inputs || Object.keys(inputs).length === 0) return null;
            const resolvedMap = resolvedValue as
                | Record<string, unknown>
                | undefined;
            return (
                <div className="space-y-1.5">
                    {Object.entries(inputs).map(([key, val]) => {
                        const rv = resolvedMap?.[key];
                        const hasRv = rv !== undefined;
                        return (
                            <div key={key} className="text-xs">
                                <div className="flex gap-2 items-baseline">
                                    <span className="font-mono font-medium text-muted-foreground shrink-0">
                                        {key}
                                    </span>
                                    <span className="text-muted-foreground/40">
                                        =
                                    </span>
                                    <span
                                        className={`font-mono ${hasRv ? "text-emerald-600" : "text-foreground"}`}
                                        title={
                                            hasRv
                                                ? formatExpression(val)
                                                : undefined
                                        }
                                    >
                                        {hasRv
                                            ? typeof rv === "string"
                                                ? rv
                                                : JSON.stringify(rv)
                                            : formatExpression(val)}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            );
        }
        case "case-list": {
            const cases = value as readonly SwitchCase[] | undefined;
            if (!cases?.length) return null;
            return (
                <div className="space-y-1.5">
                    {cases.map((c, i) => (
                        <div
                            key={`${c.branchBodyStepId}-${i}`}
                            className="text-xs"
                        >
                            <div className="flex items-center gap-2 bg-muted/30 rounded-md px-2.5 py-1.5">
                                <span className="font-mono font-medium text-muted-foreground">
                                    {c.value.type === "default"
                                        ? "default"
                                        : formatExpression(
                                              c.value as Expression,
                                          )}
                                </span>
                                <span className="text-muted-foreground/40">
                                    &rarr;
                                </span>
                                <span className="font-mono font-medium text-foreground">
                                    {c.branchBodyStepId || "—"}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            );
        }
        case "boolean":
            return (
                <Code>
                    {value === true ? "true" : value === false ? "false" : "—"}
                </Code>
            );
        case "constant":
            return <Code>{(value as string) || "—"}</Code>;
    }
}

export interface ReadOnlyStepParamsProps {
    step: WorkflowStep;
    diagnostics: ValidatorDiagnostic[];
    resolvedInputs?: Record<string, unknown>;
}

export function ReadOnlyStepParams({
    step,
    diagnostics,
    resolvedInputs,
}: ReadOnlyStepParamsProps) {
    const ui = STEP_UI[step.type as StepType];
    if (!ui) return null;

    const fields = ui.fields as Record<string, LooseFieldSpec>;
    const order = ui.order as readonly string[];

    if (order.length === 0) return null;

    const params = (step as unknown as { params?: Record<string, unknown> })
        .params;
    if (!params && !ui.paramsOptional) return null;

    return (
        <div className="space-y-2">
            {order.map((key) => {
                const spec = fields[key];
                if (!spec) return null;
                if (spec.renderIf && !spec.renderIf(step)) return null;

                const value = params?.[key];
                if (value === undefined && !ui.paramsOptional) return null;

                const resolvedValue = resolvedInputs?.[key];
                const fieldDiag = matchFieldDiagnostics(diagnostics, [
                    "params",
                    key,
                ]);

                return (
                    <div key={key}>
                        <FieldLabel>{spec.label}</FieldLabel>
                        {renderReadOnlyValue(
                            spec.kind,
                            value,
                            resolvedValue,
                            spec.label,
                        )}
                        <FieldDiagnostics diagnostics={fieldDiag} />
                    </div>
                );
            })}
        </div>
    );
}

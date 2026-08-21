import type { Expression, StepType } from "@remoraflow/core";
import type { NodeProps } from "@xyflow/react";
import type { StepNodeData } from "../graph-layout";
import { STEP_UI } from "../step-ui/registry";
import { toneColor } from "../step-ui/tone-styles";
import type { FieldKind } from "../step-ui/types";
import { formatExpression } from "../utils/expression-display";
import { NodeShell } from "./node-shell";

function NodeRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex gap-1.5 text-[11px]">
            <span className="text-muted-foreground shrink-0">{label}:</span>
            <span className="font-mono text-muted-foreground truncate">
                {value}
            </span>
        </div>
    );
}

function renderFieldSummary(kind: FieldKind, value: unknown): string {
    if (value === undefined || value === null) return "—";
    switch (kind) {
        case "expression":
            return formatExpression(value as Expression);
        case "template-text":
            return (value as string) || "—";
        case "identifier":
        case "step-ref":
        case "tool-ref":
        case "constant":
            return (value as string) || "—";
        case "tool-ref-list": {
            const list = value as readonly string[];
            return list.length > 0 ? list.join(", ") : "—";
        }
        case "json-schema":
        case "schema-map":
        case "expression-map":
        case "case-list":
            return JSON.stringify(value).slice(0, 60);
        case "boolean":
            return String(value);
    }
}

export function StepNode({ data, selected }: NodeProps) {
    const {
        step,
        diagnostics,
        hasSourceEdge,
        executionSummary,
        paused,
        layoutDirection,
        isInitial,
    } = data as unknown as StepNodeData;

    const ui = STEP_UI[step.type as StepType];
    if (!ui) return null;
    const Icon = ui.icon;

    const fields = ui.fields as Record<
        string,
        { kind: FieldKind; label: string }
    >;
    const nodeRows = (ui.nodeRows ?? []) as readonly string[];
    const params = (step as unknown as { params?: Record<string, unknown> })
        .params;

    return (
        <NodeShell
            id={step.id}
            name={step.name}
            typeLabel={ui.label}
            toneColor={toneColor(ui.tone)}
            accent={toneColor(ui.tone)}
            icon={<Icon className="w-3.5 h-3.5" />}
            description={step.description}
            diagnostics={diagnostics}
            selected={selected}
            hasSourceEdge={hasSourceEdge}
            hasTargetEdge={step.type !== "start"}
            executionSummary={executionSummary}
            paused={paused}
            layoutDirection={layoutDirection}
            isInitial={isInitial}
        >
            {nodeRows.length > 0 &&
                params &&
                nodeRows.map((key) => {
                    const spec = fields[key];
                    if (!spec) return null;
                    const value = params[key];
                    return (
                        <NodeRow
                            key={key}
                            label={spec.label.toLowerCase()}
                            value={renderFieldSummary(spec.kind, value)}
                        />
                    );
                })}
        </NodeShell>
    );
}

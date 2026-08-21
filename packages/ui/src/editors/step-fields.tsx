import type {
    Expression,
    StepType,
    ToolDefinitionMap,
    ValidatorDiagnostic,
    WorkflowStep,
} from "@remoraflow/core";
import type { JSONSchema7 } from "json-schema";
import { useMemo } from "react";
import type { FieldKind, SwitchCase } from "../step-ui/field-kinds";
import { STEP_UI } from "../step-ui/registry";
import { matchFieldDiagnostics } from "../utils/diagnostic-matching";

type LooseFieldSpec = {
    kind: FieldKind;
    label: string;
    initial: unknown;
    blurb?: string;
    schemaHint?: Record<string, unknown>;
    renderIf?: (step: unknown) => boolean;
    allowJmespath?: boolean;
    allowTemplate?: boolean;
    options?: readonly string[];
};

import { BooleanField } from "./fields/boolean-field";
import { CaseListField } from "./fields/case-list-field";
import { ConstantField } from "./fields/constant-field";
import {
    ExpressionField,
    type ExpressionFieldProps,
} from "./fields/expression-field";
import { ExpressionMapField } from "./fields/expression-map-field";
import { IdentifierField } from "./fields/identifier-field";
import { JsonSchemaField } from "./fields/json-schema-field";
import { SchemaMapField } from "./fields/schema-map-field";
import { StepRefField } from "./fields/step-ref-field";
import { TemplateTextField } from "./fields/template-text-field";
import { ToolRefField } from "./fields/tool-ref-field";
import { ToolRefListField } from "./fields/tool-ref-list-field";

export interface StepFieldsProps {
    step: WorkflowStep;
    onChange: (updates: Record<string, unknown>) => void;
    diagnostics: ValidatorDiagnostic[];
    allStepIds: string[];
    availableToolNames: string[];
    toolSchemas?: ToolDefinitionMap;
    readOnly?: boolean;
}

function getParamValue(step: WorkflowStep, key: string): unknown {
    return (step as unknown as { params?: Record<string, unknown> }).params?.[
        key
    ];
}

function updateParam(
    step: WorkflowStep,
    key: string,
    value: unknown,
    onChange: StepFieldsProps["onChange"],
) {
    const currentParams = (
        step as unknown as { params?: Record<string, unknown> }
    ).params;
    onChange({ params: { ...currentParams, [key]: value } });
}

function FieldRenderer({
    paramKey,
    spec,
    step,
    onChange,
    diagnostics,
    allStepIds,
    availableToolNames,
    toolSchemas,
}: {
    paramKey: string;
    spec: LooseFieldSpec;
    step: WorkflowStep;
    onChange: StepFieldsProps["onChange"];
    diagnostics: ValidatorDiagnostic[];
    allStepIds: string[];
    availableToolNames: string[];
    toolSchemas?: ToolDefinitionMap;
}) {
    const value = getParamValue(step, paramKey);
    const fieldDiag = useMemo(
        () => matchFieldDiagnostics(diagnostics, ["params", paramKey]),
        [diagnostics, paramKey],
    );

    const update = (v: unknown) => updateParam(step, paramKey, v, onChange);

    switch (spec.kind) {
        case "expression":
            return (
                <ExpressionField
                    value={
                        (value as Expression) ?? {
                            type: "literal",
                            value: "",
                        }
                    }
                    onChange={(v) => update(v)}
                    spec={spec as ExpressionFieldProps["spec"]}
                    diagnostics={fieldDiag}
                />
            );
        case "template-text":
            return (
                <TemplateTextField
                    value={(value as string) ?? ""}
                    onChange={(v) => update(v)}
                    label={spec.label}
                    diagnostics={fieldDiag}
                />
            );
        case "identifier":
            return (
                <IdentifierField
                    value={(value as string) ?? ""}
                    onChange={(v) => update(v || undefined)}
                    label={spec.label}
                    diagnostics={fieldDiag}
                />
            );
        case "step-ref":
            return (
                <StepRefField
                    value={(value as string) ?? ""}
                    onChange={(v) => update(v)}
                    label={spec.label}
                    diagnostics={fieldDiag}
                    allStepIds={allStepIds}
                />
            );
        case "tool-ref":
            return (
                <ToolRefField
                    value={(value as string) ?? ""}
                    onChange={(v) => update(v)}
                    label={spec.label}
                    diagnostics={fieldDiag}
                    availableToolNames={availableToolNames}
                    toolSchemas={toolSchemas}
                />
            );
        case "tool-ref-list":
            return (
                <ToolRefListField
                    value={(value as readonly string[]) ?? []}
                    onChange={(v) => update(v)}
                    label={spec.label}
                    diagnostics={fieldDiag}
                    availableToolNames={availableToolNames}
                    toolSchemas={toolSchemas}
                />
            );
        case "json-schema":
            return (
                <JsonSchemaField
                    value={(value as JSONSchema7) ?? {}}
                    onChange={(v) => update(v)}
                    label={spec.label}
                    diagnostics={fieldDiag}
                />
            );
        case "schema-map":
            return (
                <SchemaMapField
                    value={(value as Record<string, JSONSchema7>) ?? {}}
                    onChange={(v) => update(v)}
                    label={spec.label}
                    diagnostics={fieldDiag}
                    availableToolNames={availableToolNames}
                    toolSchemas={toolSchemas}
                />
            );
        case "expression-map": {
            const toolName = getParamValue(step, "toolName") as string;
            return (
                <ExpressionMapField
                    value={(value as Record<string, Expression>) ?? {}}
                    onChange={(v) => update(v)}
                    label={spec.label}
                    diagnostics={diagnostics}
                    toolName={toolName ?? ""}
                    toolSchemas={toolSchemas}
                />
            );
        }
        case "case-list":
            return (
                <CaseListField
                    value={(value as readonly SwitchCase[]) ?? []}
                    onChange={(v) => update(v)}
                    label={spec.label}
                    diagnostics={diagnostics}
                    allStepIds={allStepIds}
                />
            );
        case "boolean":
            return (
                <BooleanField
                    value={(value as boolean) ?? false}
                    onChange={(v) => update(v)}
                    label={spec.label}
                    diagnostics={fieldDiag}
                />
            );
        case "constant":
            return (
                <ConstantField
                    value={(value as string) ?? ""}
                    label={spec.label}
                    diagnostics={fieldDiag}
                />
            );
    }
}

export function StepFields({
    step,
    onChange,
    diagnostics,
    allStepIds,
    availableToolNames,
    toolSchemas,
}: StepFieldsProps) {
    const ui = STEP_UI[step.type as StepType];
    if (!ui) return null;

    const fields = ui.fields as Record<string, LooseFieldSpec>;
    const order = ui.order as readonly string[];

    return (
        <div className="space-y-3">
            {order.map((key) => {
                const spec = fields[key];
                if (!spec) return null;
                if (spec.renderIf && !spec.renderIf(step)) {
                    return null;
                }
                return (
                    <FieldRenderer
                        key={key}
                        paramKey={key}
                        spec={spec}
                        step={step}
                        onChange={onChange}
                        diagnostics={diagnostics}
                        allStepIds={allStepIds}
                        availableToolNames={availableToolNames}
                        toolSchemas={toolSchemas}
                    />
                );
            })}
        </div>
    );
}

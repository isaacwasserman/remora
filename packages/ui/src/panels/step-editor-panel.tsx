import type {
    ScopeBinding,
    StepType,
    ToolDefinitionMap,
    ValidatorDiagnostic,
    WorkflowStep,
} from "@remoraflow/core";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import type { ScopeEntry } from "../editors/expression-scope-context";
import { ExpressionScopeProvider } from "../editors/expression-scope-context";
import { WorkflowExtrasEditor } from "../editors/fields/workflow-extras-editor";
import { StepIdInput } from "../editors/shared-editors";
import { StepFields } from "../editors/step-fields";
import { STEP_UI } from "../step-ui/registry";
import {
    matchFieldDiagnostics,
    stepLevelDiagnostics,
} from "../utils/diagnostic-matching";
import { FieldDiagnostics, Label, SectionHeader, TypeBadge } from "./shared";

export interface StepEditorPanelProps {
    step: WorkflowStep;
    availableToolNames: string[];
    allStepIds: string[];
    toolSchemas?: ToolDefinitionMap;
    diagnostics?: ValidatorDiagnostic[];
    workflowInputSchema?: object;
    workflowOutputSchema?: object;
    expressionScope?: ScopeEntry[];
    expressionBindings?: ScopeBinding[];
    onChange: (updates: Record<string, unknown>) => void;
    onWorkflowMetaChange?: (updates: Record<string, unknown>) => void;
    onClose: () => void;
}

function ParamsOptionalToggle({
    step,
    onChange,
    diagnostics,
}: {
    step: WorkflowStep;
    onChange: StepEditorPanelProps["onChange"];
    diagnostics: ValidatorDiagnostic[];
}) {
    const ui = STEP_UI[step.type as StepType];
    if (!ui?.paramsOptional) return null;

    const hasParams = !!(step as unknown as { params?: object }).params;
    const outputDiagnostics = matchFieldDiagnostics(diagnostics, [
        "params",
        "output",
    ]);

    return (
        <div>
            <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer select-none">
                <input
                    type="checkbox"
                    className="rounded border-border accent-foreground"
                    checked={hasParams}
                    onChange={(e) => {
                        if (e.target.checked) {
                            const fields = ui.fields as Record<
                                string,
                                { initial: unknown }
                            >;
                            const order = ui.order as readonly string[];
                            const params: Record<string, unknown> = {};
                            for (const key of order) {
                                const spec = fields[key];
                                if (spec?.initial != null) {
                                    params[key] = spec.initial;
                                }
                            }
                            onChange({
                                params:
                                    Object.keys(params).length > 0
                                        ? params
                                        : {},
                            });
                        } else {
                            onChange({
                                params: undefined,
                            } as Record<string, unknown>);
                        }
                    }}
                />
                Has output expression
            </label>
            {!hasParams && <FieldDiagnostics diagnostics={outputDiagnostics} />}
        </div>
    );
}

function DiagnosticsSection({
    diagnostics,
}: {
    diagnostics: ValidatorDiagnostic[];
}) {
    if (diagnostics.length === 0) return null;
    const errors = diagnostics.filter((d) => d.severity === "error");
    const warnings = diagnostics.filter((d) => d.severity === "warning");

    return (
        <div className="space-y-1.5">
            {errors.map((d) => (
                <div
                    key={`err-${d.message}`}
                    className="flex gap-2 items-start text-[11px] text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30 rounded-md px-2.5 py-2 border border-red-200/80 dark:border-red-900/60"
                >
                    <span className="shrink-0 font-semibold bg-red-100 dark:bg-red-900/50 px-1.5 py-0.5 rounded text-[10px]">
                        Error
                    </span>
                    <span className="leading-relaxed">{d.message}</span>
                </div>
            ))}
            {warnings.map((d) => (
                <div
                    key={`warn-${d.message}`}
                    className="flex gap-2 items-start text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 rounded-md px-2.5 py-2 border border-amber-200/80 dark:border-amber-900/60"
                >
                    <span className="shrink-0 font-semibold bg-amber-100 dark:bg-amber-900/50 px-1.5 py-0.5 rounded text-[10px]">
                        Warn
                    </span>
                    <span className="leading-relaxed">{d.message}</span>
                </div>
            ))}
        </div>
    );
}

export function StepEditorPanel({
    step,
    availableToolNames,
    allStepIds,
    toolSchemas,
    diagnostics = [],
    workflowInputSchema,
    workflowOutputSchema,
    expressionScope,
    expressionBindings,
    onChange,
    onWorkflowMetaChange,
    onClose,
}: StepEditorPanelProps) {
    const ui = STEP_UI[step.type as StepType];
    const hasParams = !!(step as unknown as { params?: object }).params;
    const showParams =
        ui && ((ui.order as readonly string[]).length > 0 || ui.paramsOptional);

    return (
        <ExpressionScopeProvider
            scope={expressionScope}
            bindings={expressionBindings}
        >
            <div className="w-[360px] shrink-0 border-l h-full min-h-0 flex bg-card border-border">
                {/* Matches the resize gutter in the read-only detail panel. */}
                <div className="w-1.5 shrink-0" aria-hidden="true" />
                <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden">
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

                    <div className="px-4 py-4 space-y-5">
                        <DiagnosticsSection
                            diagnostics={stepLevelDiagnostics(diagnostics)}
                        />

                        <div>
                            <Label>Name</Label>
                            <Input
                                value={step.name}
                                onChange={(e) =>
                                    onChange({ name: e.target.value })
                                }
                                className="h-9 text-sm"
                                placeholder="Step name"
                            />
                            <FieldDiagnostics
                                diagnostics={matchFieldDiagnostics(
                                    diagnostics,
                                    ["name"],
                                )}
                            />
                        </div>

                        <StepIdInput
                            value={step.id}
                            onChange={(id) => onChange({ id })}
                        />
                        <FieldDiagnostics
                            diagnostics={matchFieldDiagnostics(diagnostics, [
                                "id",
                            ])}
                        />

                        <div>
                            <Label>Description</Label>
                            <Textarea
                                value={step.description}
                                onChange={(e) =>
                                    onChange({ description: e.target.value })
                                }
                                rows={2}
                                className="text-xs resize-y"
                                placeholder="What does this step do?"
                            />
                            <FieldDiagnostics
                                diagnostics={matchFieldDiagnostics(
                                    diagnostics,
                                    ["description"],
                                )}
                            />
                        </div>

                        {showParams && (
                            <div className="border-t pt-4 border-border space-y-3">
                                <SectionHeader>Parameters</SectionHeader>
                                <ParamsOptionalToggle
                                    step={step}
                                    onChange={onChange}
                                    diagnostics={diagnostics}
                                />
                                {(!ui.paramsOptional || hasParams) && (
                                    <StepFields
                                        step={step}
                                        onChange={onChange}
                                        diagnostics={diagnostics}
                                        allStepIds={allStepIds}
                                        availableToolNames={availableToolNames}
                                        toolSchemas={toolSchemas}
                                    />
                                )}
                            </div>
                        )}

                        <WorkflowExtrasEditor
                            stepType={step.type as StepType}
                            workflowInputSchema={workflowInputSchema}
                            workflowOutputSchema={workflowOutputSchema}
                            onWorkflowMetaChange={onWorkflowMetaChange}
                        />
                    </div>
                </div>
            </div>
        </ExpressionScopeProvider>
    );
}

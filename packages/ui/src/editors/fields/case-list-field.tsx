import type { Expression, ValidatorDiagnostic } from "@remoraflow/core";
import { Button } from "../../components/ui/button";
import { FieldDiagnostics, Label } from "../../panels/shared";
import type { SwitchCase } from "../../step-ui/field-kinds";
import { matchFieldDiagnostics } from "../../utils/diagnostic-matching";
import { ExpressionEditor } from "../expression-editor";
import { StepIdDropdown } from "../shared-editors";

export interface CaseListFieldProps {
    value: readonly SwitchCase[];
    onChange: (value: readonly SwitchCase[]) => void;
    label: string;
    diagnostics: ValidatorDiagnostic[];
    allStepIds: string[];
}

export function CaseListField({
    value,
    onChange,
    label,
    diagnostics,
    allStepIds,
}: CaseListFieldProps) {
    return (
        <div>
            <Label>{label}</Label>
            <div className="space-y-2">
                {value.map((c, i) => (
                    <div
                        key={`case-${c.branchBodyStepId || "empty"}-${i}`}
                        className="border border-border/70 rounded-lg p-3 space-y-2 bg-muted/20"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-foreground">
                                Case {i + 1}
                            </span>
                            <Button
                                variant="ghost"
                                size="xs"
                                className="text-red-500 hover:text-red-700"
                                onClick={() => {
                                    onChange(value.filter((_, j) => j !== i));
                                }}
                            >
                                remove
                            </Button>
                        </div>
                        {c.value.type === "default" ? (
                            <div className="text-xs text-muted-foreground italic">
                                default case
                            </div>
                        ) : (
                            <ExpressionEditor
                                label="Value"
                                value={c.value as Expression}
                                onChange={(val) => {
                                    const cases = [...value];
                                    cases[i] = {
                                        ...c,
                                        value: val as typeof c.value,
                                    };
                                    onChange(cases);
                                }}
                                diagnostics={matchFieldDiagnostics(
                                    diagnostics,
                                    ["params", "cases", i, "value"],
                                )}
                            />
                        )}
                        <StepIdDropdown
                            label="Branch Body Step"
                            value={c.branchBodyStepId}
                            onChange={(id) => {
                                const cases = [...value];
                                cases[i] = { ...c, branchBodyStepId: id };
                                onChange(cases);
                            }}
                            stepIds={allStepIds}
                            allowEmpty
                        />
                        <FieldDiagnostics
                            diagnostics={matchFieldDiagnostics(diagnostics, [
                                "params",
                                "cases",
                                i,
                                "branchBodyStepId",
                            ])}
                        />
                    </div>
                ))}
                <div className="flex gap-1">
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                            onChange([
                                ...value,
                                {
                                    value: {
                                        type: "literal" as const,
                                        value: "",
                                    },
                                    branchBodyStepId: "",
                                },
                            ]);
                        }}
                    >
                        Add Case
                    </Button>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                            if (value.some((c) => c.value.type === "default"))
                                return;
                            onChange([
                                ...value,
                                {
                                    value: { type: "default" as const },
                                    branchBodyStepId: "",
                                },
                            ]);
                        }}
                    >
                        Add Default
                    </Button>
                </div>
            </div>
        </div>
    );
}

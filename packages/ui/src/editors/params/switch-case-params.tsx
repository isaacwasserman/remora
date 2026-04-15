import type { WorkflowStep } from "@remoraflow/core";
import { Button } from "../../components/ui/button";
import { Label } from "../../panels/shared";
import { ExpressionEditor } from "../expression-editor";
import { StepIdDropdown } from "../shared-editors";
import type { Expression, StepOnChange } from "./types";

export function SwitchCaseParams({
  step,
  onChange,
  allStepIds,
}: {
  step: WorkflowStep & { type: "switch-case" };
  onChange: StepOnChange;
  allStepIds: string[];
}) {
  return (
    <div className="rf:space-y-3">
      <ExpressionEditor
        label="Switch On"
        value={step.params.switchOn as Expression}
        onChange={(val) =>
          onChange({ params: { ...step.params, switchOn: val } })
        }
      />
      <div>
        <Label>Cases</Label>
        <div className="rf:space-y-2">
          {step.params.cases.map((c, i) => (
            <div
              key={`rf:case-${c.branchBodyStepId || "empty"}-${i}`}
              className="border rf:border-border/70 rf:rounded-lg rf:p-3 rf:space-y-2 rf:bg-muted/20"
            >
              <div className="rf:flex rf:items-center rf:justify-between">
                <span className="rf:text-xs rf:font-semibold rf:text-foreground">
                  Case {i + 1}
                </span>
                <Button
                  variant="ghost"
                  size="xs"
                  className="rf:text-red-500 rf:hover:text-red-700"
                  onClick={() => {
                    const cases = step.params.cases.filter((_, j) => j !== i);
                    onChange({
                      params: { ...step.params, cases },
                    });
                  }}
                >
                  remove
                </Button>
              </div>
              {c.value.type === "default" ? (
                <div className="rf:text-xs rf:text-muted-foreground rf:italic">
                  default case
                </div>
              ) : (
                <ExpressionEditor
                  label="Value"
                  value={c.value as Expression}
                  onChange={(val) => {
                    const cases = [...step.params.cases];
                    cases[i] = { ...c, value: val as typeof c.value };
                    onChange({
                      params: { ...step.params, cases },
                    });
                  }}
                />
              )}
              <StepIdDropdown
                label="Branch Body Step"
                value={c.branchBodyStepId}
                onChange={(id) => {
                  const cases = [...step.params.cases];
                  cases[i] = {
                    ...c,
                    branchBodyStepId: id,
                  };
                  onChange({
                    params: { ...step.params, cases },
                  });
                }}
                stepIds={allStepIds}
                allowEmpty
              />
            </div>
          ))}
          <div className="rf:flex rf:gap-1">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const cases = [
                  ...step.params.cases,
                  {
                    value: {
                      type: "literal" as const,
                      value: "",
                    },
                    branchBodyStepId: "",
                  },
                ];
                onChange({
                  params: { ...step.params, cases },
                });
              }}
            >
              Add Case
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const hasDefault = step.params.cases.some(
                  (c) => c.value.type === "default",
                );
                if (hasDefault) return;
                const cases = [
                  ...step.params.cases,
                  {
                    value: { type: "default" as const },
                    branchBodyStepId: "",
                  },
                ];
                onChange({
                  params: { ...step.params, cases },
                });
              }}
            >
              Add Default
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

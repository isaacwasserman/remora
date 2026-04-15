import type { WorkflowStep } from "@remoraflow/core";
import { ExpressionEditor } from "../expression-editor";
import { StepIdDropdown } from "../shared-editors";
import type { Expression, StepOnChange } from "./types";

export function WaitForConditionParams({
  step,
  onChange,
  allStepIds,
}: {
  step: WorkflowStep & { type: "wait-for-condition" };
  onChange: StepOnChange;
  allStepIds: string[];
}) {
  return (
    <div className="rf:space-y-3">
      <StepIdDropdown
        label="Condition Step"
        value={step.params.conditionStepId}
        onChange={(id) =>
          onChange({
            params: {
              ...step.params,
              conditionStepId: id,
            },
          })
        }
        stepIds={allStepIds}
        allowEmpty
      />
      <ExpressionEditor
        label="Condition"
        value={step.params.condition as Expression}
        onChange={(val) =>
          onChange({ params: { ...step.params, condition: val } })
        }
      />
      {step.params.maxAttempts && (
        <ExpressionEditor
          label="Max Attempts"
          value={step.params.maxAttempts as Expression}
          onChange={(val) =>
            onChange({
              params: { ...step.params, maxAttempts: val },
            })
          }
        />
      )}
      {step.params.intervalMs && (
        <ExpressionEditor
          label="Interval (ms)"
          value={step.params.intervalMs as Expression}
          onChange={(val) =>
            onChange({
              params: { ...step.params, intervalMs: val },
            })
          }
        />
      )}
    </div>
  );
}

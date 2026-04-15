import type { WorkflowStep } from "@remoraflow/core";
import { Input } from "../../components/ui/input";
import { Label } from "../../panels/shared";
import { ExpressionEditor } from "../expression-editor";
import { StepIdDropdown } from "../shared-editors";
import type { Expression, StepOnChange } from "./types";

export function ForEachParams({
  step,
  onChange,
  allStepIds,
}: {
  step: WorkflowStep & { type: "for-each" };
  onChange: StepOnChange;
  allStepIds: string[];
}) {
  return (
    <div className="rf:space-y-3">
      <ExpressionEditor
        label="Target Array"
        value={step.params.target as Expression}
        onChange={(val) =>
          onChange({ params: { ...step.params, target: val } })
        }
      />
      <div>
        <Label>Item Variable Name</Label>
        <Input
          value={step.params.itemName}
          onChange={(e) =>
            onChange({
              params: { ...step.params, itemName: e.target.value },
            })
          }
          className="rf:h-8 rf:text-xs rf:font-mono"
          placeholder="item"
        />
      </div>
      <StepIdDropdown
        label="Loop Body Step"
        value={step.params.loopBodyStepId}
        onChange={(id) =>
          onChange({
            params: {
              ...step.params,
              loopBodyStepId: id,
            },
          })
        }
        stepIds={allStepIds}
        allowEmpty
      />
    </div>
  );
}

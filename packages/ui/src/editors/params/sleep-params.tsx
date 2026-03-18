import type { WorkflowStep } from "@remoraflow/core";
import { ExpressionEditor } from "../expression-editor";
import type { Expression, StepOnChange } from "./types";

export function SleepParams({
  step,
  onChange,
}: {
  step: WorkflowStep & { type: "sleep" };
  onChange: StepOnChange;
}) {
  return (
    <ExpressionEditor
      label="Duration (ms)"
      value={step.params.durationMs as Expression}
      onChange={(val) =>
        onChange({ params: { ...step.params, durationMs: val } })
      }
    />
  );
}

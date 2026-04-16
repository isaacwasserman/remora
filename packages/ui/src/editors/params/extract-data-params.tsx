import type { WorkflowStep } from "@remoraflow/core";
import { ExpressionEditor } from "../expression-editor";
import { JsonEditor } from "../shared-editors";
import type { Expression, StepOnChange } from "./types";

export function ExtractDataParams({
  step,
  onChange,
}: {
  step: WorkflowStep & { type: "extract-data" };
  onChange: StepOnChange;
}) {
  return (
    <div className="space-y-3">
      <ExpressionEditor
        label="Source Data"
        value={step.params.sourceData as Expression}
        onChange={(val) =>
          onChange({ params: { ...step.params, sourceData: val } })
        }
      />
      <JsonEditor
        label="Output Format (JSON Schema)"
        value={step.params.outputFormat}
        onChange={(val) =>
          onChange({ params: { ...step.params, outputFormat: val } })
        }
      />
    </div>
  );
}

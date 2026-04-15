import type { WorkflowStep } from "@remoraflow/core";
import { Textarea } from "../../components/ui/textarea";
import { Label } from "../../panels/shared";
import { JsonEditor } from "../shared-editors";
import type { StepOnChange } from "./types";

export function LlmPromptParams({
  step,
  onChange,
}: {
  step: WorkflowStep & { type: "llm-prompt" };
  onChange: StepOnChange;
}) {
  return (
    <div className="rf:space-y-3">
      <div>
        <Label>Prompt</Label>
        <Textarea
          value={step.params.prompt}
          onChange={(e) =>
            onChange({
              params: { ...step.params, prompt: e.target.value },
            })
          }
          rows={4}
          className="rf:text-xs rf:font-mono rf:resize-y"
          placeholder="Write your prompt here. Use ${stepId.field} for interpolation."
        />
      </div>
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

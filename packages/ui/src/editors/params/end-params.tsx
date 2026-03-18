import type { WorkflowStep } from "@remoraflow/core";
import { ExpressionEditor } from "../expression-editor";
import { JsonEditor } from "../shared-editors";
import type { Expression, StepOnChange } from "./types";

export function EndParams({
  step,
  onChange,
  workflowOutputSchema,
  onWorkflowMetaChange,
}: {
  step: WorkflowStep & { type: "end" };
  onChange: StepOnChange;
  workflowOutputSchema?: object;
  onWorkflowMetaChange?: StepOnChange;
}) {
  const hasOutput = !!step.params?.output;
  const hasSchema = !!workflowOutputSchema;
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2.5 text-xs text-foreground cursor-pointer select-none group">
        <input
          type="checkbox"
          checked={hasOutput}
          onChange={(e) => {
            if (e.target.checked) {
              onChange({
                params: {
                  output: { type: "literal", value: null },
                },
              });
            } else {
              onChange({ params: undefined } as Record<string, unknown>);
            }
          }}
          className="rounded border-border accent-foreground"
        />
        Has output expression
      </label>
      {hasOutput && step.params?.output && (
        <ExpressionEditor
          label="Output"
          value={step.params.output as Expression}
          onChange={(val) => onChange({ params: { output: val } })}
        />
      )}
      <label className="flex items-center gap-2.5 text-xs text-foreground cursor-pointer select-none group">
        <input
          type="checkbox"
          checked={hasSchema}
          onChange={(e) => {
            if (e.target.checked) {
              onWorkflowMetaChange?.({
                outputSchema: {
                  type: "object",
                  properties: {},
                },
              });
            } else {
              onWorkflowMetaChange?.({
                outputSchema: undefined,
              });
            }
          }}
          className="rounded border-border accent-foreground"
        />
        Workflow has output schema
      </label>
      {hasSchema && workflowOutputSchema && (
        <JsonEditor
          label="Output Schema (JSON Schema)"
          value={workflowOutputSchema}
          onChange={(val) => onWorkflowMetaChange?.({ outputSchema: val })}
        />
      )}
    </div>
  );
}

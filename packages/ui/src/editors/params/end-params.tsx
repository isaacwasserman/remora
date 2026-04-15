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
    <div className="rf:space-y-3">
      <label className="rf:flex rf:items-center rf:gap-2.5 rf:text-xs rf:text-foreground rf:cursor-pointer rf:select-none rf:group">
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
          className="rounded rf:border-border rf:accent-foreground"
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
      <label className="rf:flex rf:items-center rf:gap-2.5 rf:text-xs rf:text-foreground rf:cursor-pointer rf:select-none rf:group">
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
          className="rounded rf:border-border rf:accent-foreground"
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

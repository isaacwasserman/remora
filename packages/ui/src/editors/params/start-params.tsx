import { JsonEditor } from "../shared-editors";
import type { StepOnChange } from "./types";

export function StartParams({
  workflowInputSchema,
  onWorkflowMetaChange,
}: {
  workflowInputSchema?: object;
  onWorkflowMetaChange?: StepOnChange;
}) {
  const hasSchema = !!workflowInputSchema;
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2.5 text-xs text-foreground cursor-pointer select-none group">
        <input
          type="checkbox"
          checked={hasSchema}
          className="rounded border-border accent-foreground"
          onChange={(e) => {
            if (e.target.checked) {
              onWorkflowMetaChange?.({
                inputSchema: {
                  type: "object",
                  properties: {},
                },
              });
            } else {
              onWorkflowMetaChange?.({
                inputSchema: undefined,
              });
            }
          }}
        />
        Workflow has input schema
      </label>
      {hasSchema && workflowInputSchema && (
        <JsonEditor
          label="Input Schema (JSON Schema)"
          value={workflowInputSchema}
          onChange={(val) => onWorkflowMetaChange?.({ inputSchema: val })}
        />
      )}
    </div>
  );
}

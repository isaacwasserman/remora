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
    <div className="rf:space-y-3">
      <label className="rf:flex rf:items-center rf:gap-2.5 rf:text-xs rf:text-foreground rf:cursor-pointer rf:select-none rf:group">
        <input
          type="checkbox"
          checked={hasSchema}
          className="rounded rf:border-border rf:accent-foreground"
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

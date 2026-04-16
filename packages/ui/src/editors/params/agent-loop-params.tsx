import type { WorkflowStep } from "@remoraflow/core";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Label } from "../../panels/shared";
import { JsonEditor } from "../shared-editors";
import type { StepOnChange } from "./types";

export function AgentLoopParams({
  step,
  onChange,
  availableToolNames,
}: {
  step: WorkflowStep & { type: "agent-loop" };
  onChange: StepOnChange;
  availableToolNames: string[];
}) {
  return (
    <div className="space-y-3">
      <div>
        <Label>Instructions</Label>
        <Textarea
          value={step.params.instructions}
          onChange={(e) =>
            onChange({
              params: {
                ...step.params,
                instructions: e.target.value,
              },
            })
          }
          rows={4}
          className="text-xs font-mono resize-y"
          placeholder="Write agent instructions. Use ${stepId.field} for interpolation."
        />
      </div>
      <div>
        <Label>Tools</Label>
        {availableToolNames.length > 0 ? (
          <div className="space-y-1">
            {availableToolNames.map((name) => (
              <label
                key={name}
                className="flex items-center gap-2.5 text-xs text-foreground cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  className="rounded border-border accent-foreground"
                  checked={step.params.tools.includes(name)}
                  onChange={(e) => {
                    const tools = e.target.checked
                      ? [...step.params.tools, name]
                      : step.params.tools.filter((t) => t !== name);
                    onChange({
                      params: { ...step.params, tools },
                    });
                  }}
                />
                {name}
              </label>
            ))}
          </div>
        ) : (
          <Input
            value={step.params.tools.join(", ")}
            onChange={(e) =>
              onChange({
                params: {
                  ...step.params,
                  tools: e.target.value
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean),
                },
              })
            }
            className="h-8 text-xs font-mono"
            placeholder="tool1, tool2"
          />
        )}
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

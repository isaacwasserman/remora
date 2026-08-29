import type { StepType } from "@remoraflow/core";
import { STEP_UI } from "../../step-ui/registry";
import type { WorkflowExtra } from "../../step-ui/types";
import { JsonEditor } from "../shared-editors";

interface WorkflowExtrasEditorProps {
    stepType: StepType;
    workflowInputSchema?: object;
    workflowOutputSchema?: object;
    onWorkflowMetaChange?: (updates: Record<string, unknown>) => void;
}

function SchemaToggle({
    label,
    schema,
    onChange,
}: {
    label: string;
    schema: object | undefined;
    onChange: (schema: object | undefined) => void;
}) {
    const hasSchema = !!schema;
    return (
        <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer select-none">
                <input
                    type="checkbox"
                    className="rounded border-border accent-foreground"
                    checked={hasSchema}
                    onChange={(e) =>
                        onChange(
                            e.target.checked
                                ? { type: "object", properties: {} }
                                : undefined,
                        )
                    }
                />
                Workflow has {label.toLowerCase()}
            </label>
            {hasSchema && schema && (
                <JsonEditor
                    label={`${label} (JSON Schema)`}
                    value={schema}
                    onChange={(val) => onChange(val)}
                />
            )}
        </div>
    );
}

export function WorkflowExtrasEditor({
    stepType,
    workflowInputSchema,
    workflowOutputSchema,
    onWorkflowMetaChange,
}: WorkflowExtrasEditorProps) {
    const ui = STEP_UI[stepType];
    const extras = ui?.workflowExtras as readonly WorkflowExtra[] | undefined;
    if (!extras?.length || !onWorkflowMetaChange) return null;

    return (
        <div className="space-y-3">
            {extras.includes("inputSchema") && (
                <SchemaToggle
                    label="Input Schema"
                    schema={workflowInputSchema}
                    onChange={(schema) =>
                        onWorkflowMetaChange({ inputSchema: schema })
                    }
                />
            )}
            {extras.includes("outputSchema") && (
                <SchemaToggle
                    label="Output Schema"
                    schema={workflowOutputSchema}
                    onChange={(schema) =>
                        onWorkflowMetaChange({ outputSchema: schema })
                    }
                />
            )}
        </div>
    );
}

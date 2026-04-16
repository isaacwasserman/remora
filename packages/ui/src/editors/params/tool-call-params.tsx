import type { ToolDefinitionMap, WorkflowStep } from "@remoraflow/core";
import { useEffect, useRef } from "react";
import { Input } from "../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Label } from "../../panels/shared";
import { ExpressionEditor } from "../expression-editor";
import type { Expression, StepOnChange } from "./types";

export function ToolCallParams({
  step,
  onChange,
  availableToolNames,
  toolSchemas,
}: {
  step: WorkflowStep & { type: "tool-call" };
  onChange: StepOnChange;
  availableToolNames: string[];
  toolSchemas?: ToolDefinitionMap;
}) {
  const schema = toolSchemas?.[step.params.toolName];
  const schemaKeys = schema?.inputSchema.properties
    ? Object.keys(schema.inputSchema.properties)
    : null;
  const requiredKeys = new Set(schema?.inputSchema.required ?? []);

  // When tool name changes, auto-populate missing schema params
  const prevToolNameRef = useRef(step.params.toolName);
  useEffect(() => {
    if (step.params.toolName === prevToolNameRef.current) return;
    prevToolNameRef.current = step.params.toolName;

    const newSchema = toolSchemas?.[step.params.toolName];
    if (!newSchema?.inputSchema.properties) return;

    const newInput: Record<string, Expression> = {};
    for (const key of Object.keys(newSchema.inputSchema.properties)) {
      newInput[key] = (step.params.toolInput[key] as Expression) ?? {
        type: "literal",
        value: "",
      };
    }
    onChange({ params: { ...step.params, toolInput: newInput } });
  }, [
    step.params.toolName,
    step.params.toolInput,
    toolSchemas,
    onChange,
    step.params,
  ]);

  // All keys to render: schema keys (if available) or existing keys
  const displayKeys = schemaKeys ?? Object.keys(step.params.toolInput);

  return (
    <div className="space-y-3">
      <div>
        <Label>Tool Name</Label>
        {availableToolNames.length > 0 ? (
          <Select
            value={step.params.toolName}
            onValueChange={(val) =>
              onChange({
                params: { ...step.params, toolName: val },
              })
            }
          >
            <SelectTrigger className="h-8 text-xs font-mono w-full">
              <SelectValue placeholder="-- select tool --" />
            </SelectTrigger>
            <SelectContent>
              {availableToolNames.map((name) => {
                const toolSchema = toolSchemas?.[name];
                return (
                  <SelectItem
                    key={name}
                    value={name}
                    description={toolSchema?.description}
                  >
                    {toolSchema?.displayName ?? name}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        ) : (
          <Input
            value={step.params.toolName}
            onChange={(e) =>
              onChange({
                params: { ...step.params, toolName: e.target.value },
              })
            }
            className="h-8 text-xs font-mono"
            placeholder="tool-name"
          />
        )}
      </div>
      {schema?.description && (
        <p className="text-[11px] text-muted-foreground leading-snug">
          {schema.description}
        </p>
      )}
      {displayKeys.length > 0 && (
        <div>
          <Label>Tool Inputs</Label>
          <div className="space-y-2">
            {displayKeys.map((key) => {
              const expr = step.params.toolInput[key] as Expression | undefined;
              const isRequired = requiredKeys.has(key);
              const propSchema = schema?.inputSchema.properties?.[key] as
                | { description?: string; type?: string; enum?: string[] }
                | undefined;
              return (
                <div
                  key={key}
                  className="border border-border/70 rounded-lg p-3 bg-muted/20"
                >
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-xs font-mono font-medium text-foreground">
                      {key}
                    </span>
                    {isRequired && (
                      <span className="text-[10px] font-semibold text-red-500 bg-red-50 dark:bg-red-950/30 px-1.5 py-0.5 rounded">
                        required
                      </span>
                    )}
                  </div>
                  {propSchema?.description && (
                    <p className="text-[10px] text-muted-foreground mb-2 leading-relaxed">
                      {propSchema.description}
                    </p>
                  )}
                  <ExpressionEditor
                    value={expr ?? { type: "literal" as const, value: "" }}
                    onChange={(val) =>
                      onChange({
                        params: {
                          ...step.params,
                          toolInput: {
                            ...step.params.toolInput,
                            [key]: val,
                          },
                        },
                      })
                    }
                    schemaHint={propSchema}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

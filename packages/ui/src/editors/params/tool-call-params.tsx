import type { ToolDefinitionMap, WorkflowStep } from "@remoraflow/core";
import { Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Input } from "../../components/ui/input";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemDescription,
  ComboboxItemTitle,
  ComboboxList,
  ComboboxTrigger,
} from "../../components/ui/workflow-combobox";
import { Label } from "../../panels/shared";
import { ExpressionEditor } from "../expression-editor";
import { JsonViewer } from "../json-viewer";
import type { Expression, StepOnChange } from "./types";

type ToolOption = {
  value: string;
  label: string;
  description?: string;
};

type PropSchema = {
  description?: string;
  type?: string;
  enum?: string[];
  default?: unknown;
};

function formatDefaultSummary(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function summarizeSchemaType(
  schema: Record<string, unknown> | undefined,
): string {
  if (!schema || typeof schema !== "object") return "unknown";
  if (Array.isArray(schema.enum)) {
    const values = schema.enum.map((v) => JSON.stringify(v)).join(" | ");
    return values || "enum";
  }
  const type = schema.type;
  if (type === "array") {
    const items = schema.items as Record<string, unknown> | undefined;
    return `array<${summarizeSchemaType(items)}>`;
  }
  if (type === "object") return "object";
  if (Array.isArray(type)) return type.join(" | ");
  if (typeof type === "string") return type;
  if (Array.isArray(schema.oneOf) || Array.isArray(schema.anyOf))
    return "union";
  return "unknown";
}

function OutputSchemaView({ schema }: { schema: Record<string, unknown> }) {
  const properties =
    schema.type === "object" &&
    schema.properties &&
    typeof schema.properties === "object"
      ? (schema.properties as Record<string, Record<string, unknown>>)
      : null;
  const required = new Set<string>(
    Array.isArray(schema.required) ? (schema.required as string[]) : [],
  );
  const rawJson = JSON.stringify(schema, null, 2);

  return (
    <div>
      <Label>Output</Label>
      {properties ? (
        <div className="space-y-1.5">
          {Object.entries(properties).map(([key, prop]) => {
            const description =
              typeof prop?.description === "string"
                ? prop.description
                : undefined;
            const isOptional = !required.has(key);
            return (
              <div
                key={key}
                className="border border-border/70 rounded-lg p-2.5 bg-muted/20"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-mono font-medium text-foreground">
                    {key}
                    {isOptional && (
                      <span className="text-muted-foreground">?</span>
                    )}
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {summarizeSchemaType(prop)}
                  </span>
                </div>
                {description && (
                  <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                    {description}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-[11px] font-mono text-muted-foreground bg-muted/30 rounded-md px-2 py-1.5">
          returns {summarizeSchemaType(schema)}
        </div>
      )}
      <details className="mt-1.5 text-xs group">
        <summary className="text-[11px] font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors py-0.5">
          JSON Schema
        </summary>
        <div className="mt-1.5">
          <JsonViewer value={rawJson} />
        </div>
      </details>
    </div>
  );
}

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

  // When tool name changes, auto-populate missing *required* params and drop
  // any entries that don't belong to the new schema. Optional inputs are left
  // to the user to add explicitly.
  const prevToolNameRef = useRef(step.params.toolName);
  useEffect(() => {
    if (step.params.toolName === prevToolNameRef.current) return;
    prevToolNameRef.current = step.params.toolName;

    const newSchema = toolSchemas?.[step.params.toolName];
    if (!newSchema?.inputSchema.properties) return;

    const newRequired = new Set(newSchema.inputSchema.required ?? []);
    const newProps = newSchema.inputSchema.properties;
    const newInput: Record<string, Expression> = {};
    for (const key of Object.keys(newProps)) {
      const existing = step.params.toolInput[key] as Expression | undefined;
      if (existing) {
        newInput[key] = existing;
      } else if (newRequired.has(key)) {
        newInput[key] = { type: "literal", value: "" };
      }
    }
    onChange({ params: { ...step.params, toolInput: newInput } });
  }, [
    step.params.toolName,
    step.params.toolInput,
    toolSchemas,
    onChange,
    step.params,
  ]);

  const toolInput = step.params.toolInput;

  // Keys that currently have a value in toolInput — always render these.
  // When a schema is known, order required keys first (by schema order),
  // then any present optional keys (by schema order), then extra keys not
  // in the schema last.
  const presentKeys = schemaKeys
    ? [
        ...schemaKeys.filter((k) => requiredKeys.has(k) || k in toolInput),
        ...Object.keys(toolInput).filter(
          (k) => !schemaKeys.includes(k) && !requiredKeys.has(k),
        ),
      ]
    : Object.keys(toolInput);

  // Optional schema keys the user has not added yet.
  const absentOptionalKeys =
    schemaKeys?.filter((k) => !requiredKeys.has(k) && !(k in toolInput)) ?? [];

  function setInput(key: string, val: Expression) {
    onChange({
      params: {
        ...step.params,
        toolInput: { ...toolInput, [key]: val },
      },
    });
  }

  function removeInput(key: string) {
    const next = { ...toolInput };
    delete next[key];
    onChange({ params: { ...step.params, toolInput: next } });
  }

  function addOptional(key: string) {
    const propSchema = schema?.inputSchema.properties?.[key] as
      | PropSchema
      | undefined;
    const seed = propSchema?.default !== undefined ? propSchema.default : "";
    setInput(key, { type: "literal", value: seed });
  }

  const toolOptions: ToolOption[] = availableToolNames.map((name) => {
    const toolSchema = toolSchemas?.[name];
    return {
      value: name,
      label: toolSchema?.displayName ?? name,
      description: toolSchema?.description,
    };
  });
  const selectedOption =
    toolOptions.find((opt) => opt.value === step.params.toolName) ?? null;

  const [toolComboboxOpen, setToolComboboxOpen] = useState(false);

  return (
    <div className="space-y-3">
      <div>
        <Label>Tool Name</Label>
        {availableToolNames.length > 0 ? (
          <Combobox open={toolComboboxOpen} onOpenChange={setToolComboboxOpen}>
            <ComboboxTrigger className="h-8 text-xs font-mono">
              {selectedOption ? (
                selectedOption.label
              ) : (
                <span className="text-muted-foreground">-- select tool --</span>
              )}
            </ComboboxTrigger>
            <ComboboxContent>
              <ComboboxInput placeholder="Search tools..." />
              <ComboboxList>
                <ComboboxEmpty>No tools found.</ComboboxEmpty>
                <ComboboxGroup>
                  {toolOptions.map((item) => (
                    <ComboboxItem
                      key={item.value}
                      value={`${item.value} ${item.label}`}
                      selected={selectedOption?.value === item.value}
                      onSelect={() => {
                        onChange({
                          params: { ...step.params, toolName: item.value },
                        });
                        setToolComboboxOpen(false);
                      }}
                    >
                      <ComboboxItemTitle className="font-mono text-xs">
                        {item.label}
                      </ComboboxItemTitle>
                      {item.description && (
                        <ComboboxItemDescription>
                          {item.description}
                        </ComboboxItemDescription>
                      )}
                    </ComboboxItem>
                  ))}
                </ComboboxGroup>
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
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
      {presentKeys.length > 0 && (
        <div>
          <Label>Tool Inputs</Label>
          <div className="space-y-2">
            {presentKeys.map((key) => {
              const expr = toolInput[key] as Expression | undefined;
              const isRequired = requiredKeys.has(key);
              const propSchema = schema?.inputSchema.properties?.[key] as
                | PropSchema
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
                    {!isRequired && propSchema?.default !== undefined && (
                      <span
                        className="text-[10px] font-mono text-muted-foreground"
                        title="Value used when this input is omitted"
                      >
                        default: {formatDefaultSummary(propSchema.default)}
                      </span>
                    )}
                    {!isRequired && (
                      <button
                        type="button"
                        onClick={() => removeInput(key)}
                        className="ml-auto text-muted-foreground hover:text-foreground rounded p-0.5 hover:bg-muted/60"
                        title="Remove optional input"
                        aria-label={`Remove ${key}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  {propSchema?.description && (
                    <p className="text-[10px] text-muted-foreground mb-2 leading-relaxed">
                      {propSchema.description}
                    </p>
                  )}
                  <ExpressionEditor
                    value={expr ?? { type: "literal" as const, value: "" }}
                    onChange={(val) => setInput(key, val)}
                    schemaHint={propSchema}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
      {absentOptionalKeys.length > 0 && (
        <div>
          <Label>Optional Inputs</Label>
          <div className="flex flex-wrap gap-1.5">
            {absentOptionalKeys.map((key) => {
              const propSchema = schema?.inputSchema.properties?.[key] as
                | PropSchema
                | undefined;
              const hasDefault = propSchema?.default !== undefined;
              const titleParts = [propSchema?.description];
              if (hasDefault) {
                titleParts.push(
                  `Default: ${formatDefaultSummary(propSchema?.default)}`,
                );
              }
              const title = titleParts.filter(Boolean).join(" — ");
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => addOptional(key)}
                  title={title || undefined}
                  className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground hover:text-foreground border border-dashed border-border hover:border-ring rounded-md px-2 py-1 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  {key}
                  {hasDefault && (
                    <span className="text-muted-foreground/70">
                      = {formatDefaultSummary(propSchema?.default)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {schema?.outputSchema && (
        <OutputSchemaView schema={schema.outputSchema} />
      )}
    </div>
  );
}

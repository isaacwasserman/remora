import type { ExecutionState } from "@remoraflow/core";
import { Button, Input, JsonViewer, Switch } from "@remoraflow/ui";
import { useCallback, useState } from "react";

// ─── Input Form ──────────────────────────────────────────────────

interface JsonSchemaProperty {
  type?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  items?: { type?: string };
}

interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

interface WorkflowInputFormProps {
  inputSchema: JsonSchema;
  onRun: (inputs: Record<string, unknown>) => void;
  onCancel: () => void;
}

function parseFieldValue(value: string, type: string): unknown {
  if (type === "number" || type === "integer") {
    const n = Number(value);
    return Number.isNaN(n) ? 0 : n;
  }
  if (type === "boolean") return value === "true";
  if (type === "array") {
    try {
      return JSON.parse(value);
    } catch {
      return value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  if (type === "object") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return value;
}

function defaultForType(prop: JsonSchemaProperty): string {
  if (prop.default !== undefined) {
    return typeof prop.default === "string"
      ? prop.default
      : JSON.stringify(prop.default);
  }
  switch (prop.type) {
    case "number":
    case "integer":
      return "0";
    case "boolean":
      return "false";
    case "array":
      return "[]";
    case "object":
      return "{}";
    default:
      return "";
  }
}

export function WorkflowInputDialog({
  inputSchema,
  onRun,
  onCancel,
}: WorkflowInputFormProps) {
  const properties = inputSchema.properties ?? {};
  const required = new Set(inputSchema.required ?? []);
  const entries = Object.entries(properties);

  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const [key, prop] of entries) {
      initial[key] = defaultForType(prop);
    }
    return initial;
  });

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const inputs: Record<string, unknown> = {};
      for (const [key, prop] of entries) {
        const raw = values[key] ?? "";
        if (prop.type === "boolean") {
          inputs[key] = raw === "true";
        } else {
          inputs[key] = parseFieldValue(raw, prop.type ?? "string");
        }
      }
      onRun(inputs);
    },
    [values, entries, onRun],
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg mx-4 overflow-hidden"
      >
        <div className="px-5 pt-5 pb-3">
          <h2 className="text-sm font-semibold text-foreground">
            Workflow Inputs
          </h2>
          {entries.length === 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              Input schema has no properties defined.
            </p>
          )}
        </div>

        {entries.length > 0 && (
          <div className="px-5 pb-4 space-y-3 max-h-[60vh] overflow-y-auto">
            {entries.map(([key, prop]) => (
              <div key={key} className="space-y-1">
                <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                  {key}
                  {required.has(key) && <span className="text-red-400">*</span>}
                  {prop.type && (
                    <span className="text-[10px] text-muted-foreground/60 font-normal">
                      ({prop.type})
                    </span>
                  )}
                </div>
                {prop.type === "boolean" ? (
                  <Switch
                    checked={values[key] === "true"}
                    onCheckedChange={(checked) =>
                      setValues((v) => ({
                        ...v,
                        [key]: String(checked),
                      }))
                    }
                    size="sm"
                  />
                ) : prop.enum ? (
                  <select
                    value={values[key] ?? ""}
                    onChange={(e) =>
                      setValues((v) => ({
                        ...v,
                        [key]: e.target.value,
                      }))
                    }
                    className="h-8 text-xs rounded-md border border-border bg-background px-2 w-full"
                  >
                    {prop.enum.map((val) => (
                      <option key={String(val)} value={String(val)}>
                        {String(val)}
                      </option>
                    ))}
                  </select>
                ) : prop.type === "object" || prop.type === "array" ? (
                  <textarea
                    value={values[key] ?? ""}
                    onChange={(e) =>
                      setValues((v) => ({
                        ...v,
                        [key]: e.target.value,
                      }))
                    }
                    rows={3}
                    className="text-xs rounded-md border border-border bg-background px-2 py-1.5 w-full font-mono resize-y"
                    placeholder={prop.description}
                  />
                ) : (
                  <Input
                    type={
                      prop.type === "number" || prop.type === "integer"
                        ? "number"
                        : "text"
                    }
                    value={values[key] ?? ""}
                    onChange={(e) =>
                      setValues((v) => ({
                        ...v,
                        [key]: e.target.value,
                      }))
                    }
                    className="h-8 text-xs"
                    placeholder={prop.description ?? key}
                    step={prop.type === "integer" ? "1" : undefined}
                  />
                )}
                {prop.description &&
                  prop.type !== "object" &&
                  prop.type !== "array" && (
                    <div className="text-[10px] text-muted-foreground/60">
                      {prop.description}
                    </div>
                  )}
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border bg-muted/30">
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" size="sm">
            Run
          </Button>
        </div>
      </form>
    </div>
  );
}

// ─── Output Panel ────────────────────────────────────────────────

export interface WorkflowOutputPanelProps {
  executionState: ExecutionState;
}

export function WorkflowOutputPanel({
  executionState,
}: WorkflowOutputPanelProps) {
  const { status, output, durationMs, error } = executionState;
  const [expanded, setExpanded] = useState(true);

  const visible = status === "completed" || status === "failed";

  const statusColor =
    status === "completed"
      ? "text-green-700 dark:text-green-400"
      : "text-red-700 dark:text-red-400";
  const statusBg =
    status === "completed"
      ? "bg-green-50 dark:bg-green-950/30"
      : "bg-red-50 dark:bg-red-950/30";

  const formatted =
    output === undefined
      ? undefined
      : typeof output === "string"
        ? output
        : JSON.stringify(output, null, 2);

  return (
    <div
      className="border-t border-border bg-card"
      style={visible ? undefined : { display: "none" }}
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full px-4 py-2 flex items-center gap-3 hover:bg-muted/30 transition-colors"
      >
        <span className="text-xs font-semibold text-foreground">
          Workflow Output
        </span>
        <span
          className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${statusBg} ${statusColor}`}
        >
          {status}
        </span>
        {durationMs !== undefined && (
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {durationMs < 1000
              ? `${durationMs}ms`
              : `${(durationMs / 1000).toFixed(1)}s`}
          </span>
        )}
        <span className="ml-auto text-muted-foreground text-xs">
          {expanded ? "\u25B2" : "\u25BC"}
        </span>
      </button>
      {expanded && (
        <div className="px-4 pb-3 space-y-2">
          {error && (
            <div className="text-xs p-2.5 rounded-md bg-red-50 text-red-700 border border-red-200/80 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800/60">
              <div className="font-semibold font-mono">{error.code}</div>
              <div className="mt-1 leading-relaxed">{error.message}</div>
            </div>
          )}
          <JsonViewer value={formatted} />
          {formatted === undefined && !error && (
            <div className="text-xs text-muted-foreground italic">
              No output returned
            </div>
          )}
        </div>
      )}
    </div>
  );
}

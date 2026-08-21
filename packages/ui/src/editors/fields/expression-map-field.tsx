import type {
    Expression,
    ToolDefinitionMap,
    ValidatorDiagnostic,
} from "@remoraflow/core";
import { Plus, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { Label } from "../../panels/shared";
import { matchFieldDiagnostics } from "../../utils/diagnostic-matching";
import { ExpressionEditor } from "../expression-editor";
import { JsonViewer } from "../json-viewer";

type PropSchema = {
    description?: string;
    type?: string;
    enum?: string[];
    default?: unknown;
};

function formatDefault(value: unknown): string {
    if (typeof value === "string") return value;
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

export interface ExpressionMapFieldProps {
    value: Record<string, Expression>;
    onChange: (value: Record<string, Expression>) => void;
    label: string;
    diagnostics: ValidatorDiagnostic[];
    toolName: string;
    toolSchemas?: ToolDefinitionMap;
}

export function ExpressionMapField({
    value,
    onChange,
    label,
    diagnostics,
    toolName,
    toolSchemas,
}: ExpressionMapFieldProps) {
    const schema = toolSchemas?.[toolName];

    const prevToolNameRef = useRef(toolName);
    useEffect(() => {
        if (toolName === prevToolNameRef.current) return;
        prevToolNameRef.current = toolName;
        const newSchema = toolSchemas?.[toolName];
        if (!newSchema?.inputSchema.properties) return;
        const newRequired = new Set(newSchema.inputSchema.required ?? []);
        const newProps = newSchema.inputSchema.properties;
        const newInput: Record<string, Expression> = {};
        for (const key of Object.keys(newProps)) {
            const existing = value[key];
            if (existing) {
                newInput[key] = existing;
            } else if (newRequired.has(key)) {
                newInput[key] = { type: "literal", value: "" };
            }
        }
        onChange(newInput);
    }, [toolName, value, toolSchemas, onChange]);

    const schemaKeys = schema?.inputSchema.properties
        ? Object.keys(schema.inputSchema.properties)
        : null;
    const requiredKeys = new Set(schema?.inputSchema.required ?? []);

    const presentKeys = schemaKeys
        ? [
              ...schemaKeys.filter((k) => requiredKeys.has(k) || k in value),
              ...Object.keys(value).filter(
                  (k) => !schemaKeys?.includes(k) && !requiredKeys.has(k),
              ),
          ]
        : Object.keys(value);

    const absentOptionalKeys =
        schemaKeys?.filter((k) => !requiredKeys.has(k) && !(k in value)) ?? [];

    function setInput(key: string, val: Expression) {
        onChange({ ...value, [key]: val });
    }

    function removeInput(key: string) {
        const next = { ...value };
        delete next[key];
        onChange(next);
    }

    function addOptional(key: string) {
        const propSchema = schema?.inputSchema.properties?.[key] as
            | PropSchema
            | undefined;
        const seed =
            propSchema?.default !== undefined ? propSchema.default : "";
        setInput(key, { type: "literal", value: seed });
    }

    return (
        <div className="space-y-2">
            {presentKeys.length > 0 && (
                <div>
                    <Label>{label}</Label>
                    <div className="space-y-2">
                        {presentKeys.map((key) => {
                            const expr = value[key];
                            const isRequired = requiredKeys.has(key);
                            const propSchema = schema?.inputSchema.properties?.[
                                key
                            ] as PropSchema | undefined;
                            return (
                                <div
                                    key={key}
                                    className="border border-border/70 rounded-lg p-3 bg-muted/20"
                                >
                                    <div className="flex items-center gap-1.5 mb-1.5">
                                        <span className="text-xs font-mono font-medium text-foreground">
                                            {key}
                                        </span>
                                        {!isRequired && (
                                            <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                                optional
                                            </span>
                                        )}
                                        {!isRequired &&
                                            propSchema?.default !==
                                                undefined && (
                                                <span className="text-[10px] font-mono text-muted-foreground">
                                                    default:{" "}
                                                    {formatDefault(
                                                        propSchema.default,
                                                    )}
                                                </span>
                                            )}
                                        {!isRequired && (
                                            <button
                                                type="button"
                                                onClick={() => removeInput(key)}
                                                className="ml-auto text-muted-foreground hover:text-foreground rounded p-0.5 hover:bg-muted/60"
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
                                        value={
                                            expr ?? {
                                                type: "literal" as const,
                                                value: "",
                                            }
                                        }
                                        onChange={(val) => setInput(key, val)}
                                        schemaHint={propSchema}
                                        diagnostics={matchFieldDiagnostics(
                                            diagnostics,
                                            ["params", "toolInput", key],
                                        )}
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
                            const propSchema = schema?.inputSchema.properties?.[
                                key
                            ] as PropSchema | undefined;
                            const hasDefault =
                                propSchema?.default !== undefined;
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => addOptional(key)}
                                    title={propSchema?.description || undefined}
                                    className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground hover:text-foreground border border-dashed border-border hover:border-ring rounded-md px-2 py-1 transition-colors"
                                >
                                    <Plus className="w-3 h-3" />
                                    {key}
                                    {hasDefault && (
                                        <span className="text-muted-foreground/70">
                                            ={" "}
                                            {formatDefault(propSchema?.default)}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
            {schema?.description && (
                <p className="text-[10px] text-muted-foreground leading-snug">
                    {schema.description}
                </p>
            )}
            {schema?.outputSchema && (
                <div>
                    <Label>Output Schema</Label>
                    <JsonViewer
                        value={JSON.stringify(schema.outputSchema, null, 2)}
                    />
                </div>
            )}
        </div>
    );
}

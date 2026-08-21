import type { ToolDefinitionMap, ValidatorDiagnostic } from "@remoraflow/core";
import type { JSONSchema7 } from "json-schema";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { Input } from "../../components/ui/input";
import { Label } from "../../panels/shared";
import { JsonCodeEditor } from "../json-code-editor";
import { FieldRow } from "./field-row";

export interface SchemaMapFieldProps {
    value: Record<string, JSONSchema7>;
    onChange: (value: Record<string, JSONSchema7>) => void;
    label: string;
    diagnostics: ValidatorDiagnostic[];
    availableToolNames?: string[];
    toolSchemas?: ToolDefinitionMap;
}

export function SchemaMapField({
    value,
    onChange,
    label,
    diagnostics,
    availableToolNames,
    toolSchemas,
}: SchemaMapFieldProps) {
    const [newKey, setNewKey] = useState("");
    const keys = Object.keys(value);
    const addableTools =
        availableToolNames?.filter((name) => !(name in value)) ?? [];

    function setEntry(key: string, schema: JSONSchema7) {
        onChange({ ...value, [key]: schema });
    }

    function removeEntry(key: string) {
        const next = { ...value };
        delete next[key];
        onChange(next);
    }

    function addEntry(key: string) {
        if (!key || key in value) return;
        const baseSchema = toolSchemas?.[key]?.inputSchema as
            | JSONSchema7
            | undefined;
        onChange({ ...value, [key]: baseSchema ?? { type: "object" } });
        setNewKey("");
    }

    return (
        <FieldRow label={label} diagnostics={diagnostics}>
            <div className="space-y-2">
                {keys.map((key) => (
                    <div
                        key={key}
                        className="border border-border/70 rounded-lg p-3 bg-muted/20"
                    >
                        <div className="flex items-center gap-1.5 mb-1.5">
                            <span className="text-xs font-mono font-medium text-foreground">
                                {key}
                            </span>
                            <button
                                type="button"
                                onClick={() => removeEntry(key)}
                                className="ml-auto text-muted-foreground hover:text-foreground rounded p-0.5 hover:bg-muted/60"
                                aria-label={`Remove ${key}`}
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </div>
                        <JsonCodeEditor
                            value={JSON.stringify(value[key], null, 2)}
                            onChange={(text) => {
                                try {
                                    const parsed = JSON.parse(text);
                                    if (
                                        typeof parsed === "object" &&
                                        parsed !== null
                                    ) {
                                        setEntry(key, parsed as JSONSchema7);
                                    }
                                } catch {
                                    // keep text but don't propagate invalid JSON
                                }
                            }}
                        />
                    </div>
                ))}
                {addableTools.length > 0 ? (
                    <div>
                        <Label>Add Constraint</Label>
                        <div className="flex flex-wrap gap-1.5">
                            {addableTools.map((name) => (
                                <button
                                    key={name}
                                    type="button"
                                    onClick={() => addEntry(name)}
                                    className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground hover:text-foreground border border-dashed border-border hover:border-ring rounded-md px-2 py-1 transition-colors"
                                >
                                    <Plus className="w-3 h-3" />
                                    {name}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="flex gap-1.5">
                        <Input
                            value={newKey}
                            onChange={(e) => setNewKey(e.target.value)}
                            placeholder="tool name"
                            className="h-7 text-xs font-mono flex-1"
                            onKeyDown={(e) => {
                                if (e.key === "Enter") addEntry(newKey);
                            }}
                        />
                        <button
                            type="button"
                            onClick={() => addEntry(newKey)}
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border hover:border-ring rounded-md px-2 py-0.5 transition-colors"
                        >
                            <Plus className="w-3 h-3" />
                            Add
                        </button>
                    </div>
                )}
            </div>
        </FieldRow>
    );
}

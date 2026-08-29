import type { ToolDefinitionMap, ValidatorDiagnostic } from "@remoraflow/core";
import { Input } from "../../components/ui/input";
import { FieldRow } from "./field-row";

export interface ToolRefListFieldProps {
    value: readonly string[];
    onChange: (value: readonly string[]) => void;
    label: string;
    diagnostics: ValidatorDiagnostic[];
    availableToolNames: string[];
    toolSchemas?: ToolDefinitionMap;
}

export function ToolRefListField({
    value,
    onChange,
    label,
    diagnostics,
    availableToolNames,
    toolSchemas,
}: ToolRefListFieldProps) {
    if (availableToolNames.length === 0) {
        return (
            <FieldRow label={label} diagnostics={diagnostics}>
                <Input
                    value={(value as string[]).join(", ")}
                    onChange={(e) =>
                        onChange(
                            e.target.value
                                .split(",")
                                .map((t) => t.trim())
                                .filter(Boolean),
                        )
                    }
                    className="h-8 text-xs font-mono"
                    placeholder="tool1, tool2"
                />
            </FieldRow>
        );
    }

    return (
        <FieldRow label={label} diagnostics={diagnostics}>
            <div className="space-y-1">
                {availableToolNames.map((name) => {
                    const schema = toolSchemas?.[name];
                    return (
                        <label
                            key={name}
                            className="flex items-start gap-2.5 text-xs text-foreground cursor-pointer select-none"
                        >
                            <input
                                type="checkbox"
                                className="mt-0.5 rounded border-border accent-foreground"
                                checked={value.includes(name)}
                                onChange={(e) => {
                                    const next = e.target.checked
                                        ? [...value, name]
                                        : value.filter((t) => t !== name);
                                    onChange(next);
                                }}
                            />
                            <span className="flex flex-col gap-0.5 min-w-0">
                                <span>{schema?.displayName ?? name}</span>
                                {schema?.description && (
                                    <span className="text-[10px] text-muted-foreground leading-snug">
                                        {schema.description}
                                    </span>
                                )}
                            </span>
                        </label>
                    );
                })}
            </div>
        </FieldRow>
    );
}

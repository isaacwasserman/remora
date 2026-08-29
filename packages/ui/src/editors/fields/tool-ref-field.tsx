import type { ToolDefinitionMap, ValidatorDiagnostic } from "@remoraflow/core";
import { useState } from "react";
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
} from "../../components/ui/combobox";
import { Input } from "../../components/ui/input";
import { FieldRow } from "./field-row";

export interface ToolRefFieldProps {
    value: string;
    onChange: (value: string) => void;
    label: string;
    diagnostics: ValidatorDiagnostic[];
    availableToolNames: string[];
    toolSchemas?: ToolDefinitionMap;
}

export function ToolRefField({
    value,
    onChange,
    label,
    diagnostics,
    availableToolNames,
    toolSchemas,
}: ToolRefFieldProps) {
    const [open, setOpen] = useState(false);

    const toolOptions = availableToolNames.map((name) => {
        const schema = toolSchemas?.[name];
        return {
            value: name,
            label: schema?.displayName ?? name,
            description: schema?.description,
        };
    });
    const selected = toolOptions.find((opt) => opt.value === value) ?? null;

    if (availableToolNames.length === 0) {
        return (
            <FieldRow label={label} diagnostics={diagnostics}>
                <Input
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="h-8 text-xs font-mono"
                    placeholder="tool-name"
                />
            </FieldRow>
        );
    }

    return (
        <FieldRow label={label} diagnostics={diagnostics}>
            <Combobox open={open} onOpenChange={setOpen}>
                <ComboboxTrigger className="h-8 text-xs">
                    {selected ? (
                        selected.label
                    ) : (
                        <span className="text-muted-foreground">
                            -- select tool --
                        </span>
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
                                    selected={selected?.value === item.value}
                                    onSelect={() => {
                                        onChange(item.value);
                                        setOpen(false);
                                    }}
                                >
                                    <ComboboxItemTitle className="text-xs">
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
        </FieldRow>
    );
}

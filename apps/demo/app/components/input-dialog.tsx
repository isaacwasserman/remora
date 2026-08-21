import type React from "react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";

interface InputDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    inputSchema: Record<string, unknown>;
    onRun: (inputs: Record<string, unknown>) => void;
}

interface PropertySchema {
    type?: string;
    description?: string;
    default?: unknown;
}

export function InputDialog({
    open,
    onOpenChange,
    inputSchema,
    onRun,
}: InputDialogProps) {
    const properties = (inputSchema.properties ?? {}) as Record<
        string,
        PropertySchema
    >;
    const required = (inputSchema.required ?? []) as string[];
    const propEntries = Object.entries(properties);

    const [values, setValues] = useState<Record<string, unknown>>(() => {
        const initial: Record<string, unknown> = {};
        for (const [key, schema] of propEntries) {
            if (schema.default !== undefined) {
                initial[key] = schema.default;
            } else if (schema.type === "boolean") {
                initial[key] = false;
            } else if (schema.type === "number") {
                initial[key] = 0;
            } else if (schema.type === "string") {
                initial[key] = "";
            } else {
                initial[key] = "";
            }
        }
        return initial;
    });

    const handleRun = () => {
        const resolved: Record<string, unknown> = {};
        for (const [key, schema] of propEntries) {
            const val = values[key];
            if (
                schema.type !== "string" &&
                schema.type !== "number" &&
                schema.type !== "boolean" &&
                typeof val === "string"
            ) {
                try {
                    resolved[key] = JSON.parse(val);
                } catch {
                    resolved[key] = val;
                }
            } else {
                resolved[key] = val;
            }
        }
        onRun(resolved);
        onOpenChange(false);
    };

    const setValue = (key: string, value: unknown) => {
        setValues((prev) => ({ ...prev, [key]: value }));
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Workflow Input</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-2">
                    {propEntries.map(([key, schema]) => (
                        <div key={key} className="grid gap-2">
                            <Label htmlFor={`input-${key}`}>
                                {key}
                                {required.includes(key) && (
                                    <span className="text-destructive ml-1">
                                        *
                                    </span>
                                )}
                            </Label>
                            {schema.description && (
                                <p className="text-xs text-muted-foreground -mt-1">
                                    {schema.description}
                                </p>
                            )}
                            {renderField(key, schema, values[key], setValue)}
                        </div>
                    ))}
                </div>
                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                    >
                        Cancel
                    </Button>
                    <Button onClick={handleRun}>Run</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function renderField(
    key: string,
    schema: PropertySchema,
    value: unknown,
    onChange: (key: string, value: unknown) => void,
) {
    switch (schema.type) {
        case "string":
            return (
                <Input
                    id={`input-${key}`}
                    value={(value as string) ?? ""}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        onChange(key, e.target.value)
                    }
                />
            );
        case "number":
            return (
                <Input
                    id={`input-${key}`}
                    type="number"
                    value={String(value ?? 0)}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        onChange(key, Number(e.target.value))
                    }
                />
            );
        case "boolean":
            return (
                <label className="flex items-center gap-2">
                    <input
                        id={`input-${key}`}
                        type="checkbox"
                        checked={!!value}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            onChange(key, e.target.checked)
                        }
                        className="accent-primary"
                    />
                    <span className="text-sm">Enabled</span>
                </label>
            );
        default:
            return (
                <Textarea
                    id={`input-${key}`}
                    placeholder="JSON value"
                    value={
                        typeof value === "string"
                            ? value
                            : JSON.stringify(value, null, 2)
                    }
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                        onChange(key, e.target.value)
                    }
                    rows={3}
                />
            );
    }
}

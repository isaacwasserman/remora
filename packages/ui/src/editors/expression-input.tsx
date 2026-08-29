import type { EditorView } from "@codemirror/view";
import { Braces } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import {
    Command,
    CommandGroup,
    CommandItem,
    CommandList,
} from "../components/ui/command";
import {
    Popover,
    PopoverAnchor,
    PopoverContent,
} from "../components/ui/popover";
import type { ExpressionSuggestion } from "./expression-scope-context";
import { JmespathCodeEditor } from "./jmespath-code-editor";

const ROOT_KIND_LABEL: Record<ExpressionSuggestion["rootKind"], string> = {
    input: "input",
    stepOutput: "step",
    loopVar: "loop",
};

interface ExpressionInputProps {
    value: string;
    onChange: (value: string) => void;
    suggestions: ExpressionSuggestion[] | null;
    placeholder?: string;
    className?: string;
}

/**
 * Editable JMESPath surface with path suggestions. The editor itself is shared
 * with the read-only step-detail renderer.
 */
export function ExpressionInput({
    value,
    onChange,
    suggestions,
    placeholder,
    className,
}: ExpressionInputProps) {
    const editorViewRef = useRef<EditorView | null>(null);
    const [open, setOpen] = useState(false);
    const hasSuggestions = !!suggestions && suggestions.length > 0;
    const matchingSuggestions = useMemo(() => {
        if (!suggestions) return [];
        const query = value.toLowerCase();
        return suggestions.filter((suggestion) =>
            suggestion.path.toLowerCase().includes(query),
        );
    }, [suggestions, value]);

    function selectSuggestion(suggestion: ExpressionSuggestion) {
        onChange(suggestion.path);
        setOpen(false);
        editorViewRef.current?.focus();
    }

    const editor = (
        <div className="relative">
            <JmespathCodeEditor
                value={value}
                onChange={(expression) => {
                    onChange(expression);
                    if (hasSuggestions) setOpen(true);
                }}
                onFocus={() => hasSuggestions && setOpen(true)}
                placeholder={placeholder}
                className={className}
                onEditorViewChange={(view) => {
                    editorViewRef.current = view;
                }}
            />
            {hasSuggestions && (
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className="absolute top-1/2 right-1.5 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    title="Insert expression"
                    aria-label="Insert expression"
                >
                    <Braces className="h-3.5 w-3.5" />
                </button>
            )}
        </div>
    );

    if (!hasSuggestions) return editor;

    return (
        <Popover
            open={open && matchingSuggestions.length > 0}
            onOpenChange={setOpen}
        >
            <PopoverAnchor asChild>{editor}</PopoverAnchor>
            <PopoverContent
                align="start"
                sideOffset={4}
                className="w-(--radix-popover-trigger-width) min-w-[var(--radix-popover-trigger-width)] p-0"
                onOpenAutoFocus={(event) => event.preventDefault()}
                onCloseAutoFocus={(event) => event.preventDefault()}
            >
                <Command>
                    <CommandList className="max-h-[240px]">
                        <CommandGroup>
                            {matchingSuggestions.map((suggestion) => (
                                <CommandItem
                                    key={suggestion.path}
                                    value={suggestion.path}
                                    onSelect={() =>
                                        selectSuggestion(suggestion)
                                    }
                                    className="flex flex-col items-start gap-0.5 py-1.5"
                                >
                                    <div className="flex w-full items-center gap-2">
                                        <span className="font-mono text-xs truncate flex-1 min-w-0">
                                            {suggestion.path}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground shrink-0">
                                            {
                                                ROOT_KIND_LABEL[
                                                    suggestion.rootKind
                                                ]
                                            }
                                            {suggestion.type
                                                ? ` · ${suggestion.type}`
                                                : ""}
                                        </span>
                                    </div>
                                    {suggestion.description && (
                                        <span className="text-[10px] text-muted-foreground/80 leading-snug truncate w-full">
                                            {suggestion.description}
                                        </span>
                                    )}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

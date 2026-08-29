import type { EditorView } from "@codemirror/view";
import { Braces } from "lucide-react";
import { useRef, useState } from "react";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "../components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "../components/ui/popover";
import type { ExpressionSuggestion } from "./expression-scope-context";
import { TemplateCodeEditor } from "./template-code-editor";

const ROOT_KIND_LABEL: Record<ExpressionSuggestion["rootKind"], string> = {
    input: "input",
    stepOutput: "step",
    loopVar: "loop",
};

interface TemplateExpressionInputProps {
    value: string;
    onChange: (value: string) => void;
    suggestions: ExpressionSuggestion[] | null;
    placeholder?: string;
    className?: string;
}

/**
 * A template editor for string templates with embedded `${path}` JMESPath
 * expressions. When in-scope suggestions are available, an insert button is
 * shown that splices the picked path (wrapped in `${...}`) at the cursor.
 */
export function TemplateExpressionInput({
    value,
    onChange,
    suggestions,
    placeholder,
    className,
}: TemplateExpressionInputProps) {
    const editorViewRef = useRef<EditorView | null>(null);
    const cursorRef = useRef<number>(value.length);
    const [open, setOpen] = useState(false);

    const hasSuggestions = !!suggestions && suggestions.length > 0;

    function rememberCursor() {
        cursorRef.current =
            editorViewRef.current?.state.selection.main.head ?? value.length;
    }

    function insertAtCursor(path: string) {
        const insertion = `\${${path}}`;
        const start = cursorRef.current;
        const next = `${value.slice(0, start)}${insertion}${value.slice(start)}`;
        const editor = editorViewRef.current;
        if (editor) {
            const pos = start + insertion.length;
            editor.dispatch({
                changes: { from: start, to: start, insert: insertion },
                selection: { anchor: pos },
            });
            editor.focus();
            cursorRef.current = pos;
        } else {
            onChange(next);
        }
    }

    return (
        <div className="relative">
            <TemplateCodeEditor
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                className={className}
                onEditorViewChange={(view) => {
                    editorViewRef.current = view;
                }}
            />
            {hasSuggestions && (
                <Popover
                    open={open}
                    onOpenChange={(next) => {
                        if (next) {
                            rememberCursor();
                        }
                        setOpen(next);
                    }}
                >
                    <PopoverTrigger asChild>
                        <button
                            type="button"
                            className="absolute z-20 top-1.5 right-1.5 inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                            title="Insert expression"
                            aria-label="Insert expression"
                        >
                            <Braces className="h-3.5 w-3.5" />
                        </button>
                    </PopoverTrigger>
                    <PopoverContent
                        align="end"
                        sideOffset={4}
                        className="w-72 p-0"
                    >
                        <Command>
                            <CommandInput
                                placeholder="Search paths..."
                                className="text-xs"
                            />
                            <CommandList className="max-h-[240px]">
                                <CommandEmpty>No matching paths.</CommandEmpty>
                                <CommandGroup>
                                    {suggestions.map((s) => (
                                        <CommandItem
                                            key={s.path}
                                            value={s.path}
                                            onSelect={() => {
                                                insertAtCursor(s.path);
                                                setOpen(false);
                                            }}
                                            className="flex flex-col items-start gap-0.5 py-1.5"
                                        >
                                            <div className="flex w-full items-center gap-2">
                                                <span className="font-mono text-xs truncate flex-1 min-w-0">
                                                    {s.path}
                                                </span>
                                                <span className="text-[10px] text-muted-foreground shrink-0">
                                                    {
                                                        ROOT_KIND_LABEL[
                                                            s.rootKind
                                                        ]
                                                    }
                                                    {s.type
                                                        ? ` · ${s.type}`
                                                        : ""}
                                                </span>
                                            </div>
                                            {s.description && (
                                                <span className="text-[10px] text-muted-foreground/80 leading-snug truncate w-full">
                                                    {s.description}
                                                </span>
                                            )}
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>
            )}
        </div>
    );
}

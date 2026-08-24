import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { bracketMatching, indentOnInput } from "@codemirror/language";
import { linter } from "@codemirror/lint";
import {
    type Compartment,
    EditorState,
    type Extension,
} from "@codemirror/state";
import {
    drawSelection,
    EditorView,
    highlightSpecialChars,
    keymap,
    placeholder,
} from "@codemirror/view";
import { useCallback, useEffect, useRef } from "react";
import { cn } from "../lib/utils";
import { syncValue, useCodemirror } from "./codemirror/use-codemirror";
import { buildJsonEditorTheme } from "./codemirror-theme";

export interface JsonEditorProps {
    value: string | undefined;
    onChange?: (value: string) => void;
    className?: string;
    placeholderText?: string;
    onBlur?: () => void;
    maxHeight?: string;
}

export function JsonEditor({
    value,
    onChange,
    className,
    placeholderText,
    onBlur,
    maxHeight,
}: JsonEditorProps) {
    const editable = onChange !== undefined;
    const maxHeightRef = useRef(maxHeight);
    const placeholderRef = useRef(placeholderText);
    const hidden = !editable && !value;

    const extensions = useCallback(
        (_themeCompartment: Compartment) => {
            const exts: Extension[] = [
                highlightSpecialChars(),
                drawSelection(),
                bracketMatching(),
                json(),
                EditorView.lineWrapping,
            ];
            if (editable) {
                exts.push(
                    history(),
                    closeBrackets(),
                    indentOnInput(),
                    linter(jsonParseLinter(), { delay: 300 }),
                    keymap.of([
                        ...closeBracketsKeymap,
                        ...defaultKeymap,
                        ...historyKeymap,
                    ]),
                );
            } else {
                exts.push(
                    EditorState.readOnly.of(true),
                    EditorView.editable.of(false),
                );
            }
            if (placeholderRef.current) {
                exts.push(placeholder(placeholderRef.current));
            }
            return exts;
        },
        [editable],
    );

    const buildTheme = useCallback(
        (dark: boolean) => buildJsonEditorTheme(dark, maxHeightRef.current),
        [],
    );

    const { containerRef, viewRef } = useCodemirror({
        initialValue: value ?? "",
        extensions,
        buildTheme,
        onChange,
        onBlur,
    });

    useEffect(() => syncValue(viewRef, value ?? ""), [value, viewRef]);

    return (
        <div
            ref={containerRef}
            className={cn("json-editor", className)}
            style={hidden ? { display: "none" } : undefined}
        />
    );
}

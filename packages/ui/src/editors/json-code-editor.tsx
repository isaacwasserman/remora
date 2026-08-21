import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import {
    bracketMatching,
    foldKeymap,
    indentOnInput,
} from "@codemirror/language";
import { linter } from "@codemirror/lint";
import type { Compartment } from "@codemirror/state";
import {
    drawSelection,
    EditorView,
    highlightSpecialChars,
    keymap,
    lineNumbers,
    placeholder,
} from "@codemirror/view";
import { useCallback, useEffect, useRef } from "react";
import { cn } from "../lib/utils";
import { syncValue, useCodemirror } from "./codemirror/use-codemirror";
import { buildEditorTheme } from "./codemirror-theme";

export interface JsonCodeEditorProps {
    value: string;
    onChange: (value: string) => void;
    className?: string;
    placeholderText?: string;
    onBlur?: () => void;
    maxHeight?: string;
}

export function JsonCodeEditor({
    value,
    onChange,
    className,
    placeholderText,
    onBlur,
    maxHeight,
}: JsonCodeEditorProps) {
    const maxHeightRef = useRef(maxHeight);
    const placeholderRef = useRef(placeholderText);

    const extensions = useCallback((_themeCompartment: Compartment) => {
        const exts = [
            lineNumbers(),
            highlightSpecialChars(),
            history(),
            drawSelection(),
            bracketMatching(),
            closeBrackets(),
            indentOnInput(),
            json(),
            linter(jsonParseLinter(), { delay: 300 }),
            keymap.of([
                ...closeBracketsKeymap,
                ...defaultKeymap,
                ...historyKeymap,
                ...foldKeymap,
            ]),
            EditorView.lineWrapping,
        ];
        if (placeholderRef.current) {
            exts.push(placeholder(placeholderRef.current));
        }
        return exts;
    }, []);

    const buildTheme = useCallback(
        (dark: boolean) => buildEditorTheme(dark, maxHeightRef.current),
        [],
    );

    const { containerRef, viewRef } = useCodemirror({
        initialValue: value,
        extensions,
        buildTheme,
        onChange,
        onBlur,
    });

    useEffect(() => syncValue(viewRef, value), [value, viewRef]);

    return (
        <div ref={containerRef} className={cn("json-code-editor", className)} />
    );
}

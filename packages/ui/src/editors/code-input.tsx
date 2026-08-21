import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { bracketMatching } from "@codemirror/language";
import type { Compartment } from "@codemirror/state";
import {
    placeholder as cmPlaceholder,
    drawSelection,
    EditorView,
    keymap,
} from "@codemirror/view";
import { useCallback, useEffect, useRef } from "react";
import { cn } from "../lib/utils";
import { syncValue, useCodemirror } from "./codemirror/use-codemirror";
import { buildEditorTheme } from "./codemirror-theme";

export interface CodeInputProps {
    value: string;
    onChange: (value: string) => void;
    className?: string;
    placeholder?: string;
    multiline?: boolean;
    onBlur?: () => void;
}

export function CodeInput({
    value,
    onChange,
    className,
    placeholder,
    multiline = false,
    onBlur,
}: CodeInputProps) {
    const placeholderRef = useRef(placeholder);
    const maxH = multiline ? "200px" : "120px";

    const extensions = useCallback((_themeCompartment: Compartment) => {
        const exts = [
            history(),
            drawSelection(),
            bracketMatching(),
            closeBrackets(),
            keymap.of([
                ...closeBracketsKeymap,
                ...defaultKeymap,
                ...historyKeymap,
            ]),
            EditorView.lineWrapping,
        ];
        if (placeholderRef.current) {
            exts.push(cmPlaceholder(placeholderRef.current));
        }
        return exts;
    }, []);

    const maxHRef = useRef(maxH);
    const buildTheme = useCallback(
        (dark: boolean) => buildEditorTheme(dark, maxHRef.current),
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

    return <div ref={containerRef} className={cn("code-input", className)} />;
}

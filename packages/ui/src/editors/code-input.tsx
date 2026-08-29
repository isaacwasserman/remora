import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { bracketMatching } from "@codemirror/language";
import { type Compartment, EditorState } from "@codemirror/state";
import {
    placeholder as cmPlaceholder,
    drawSelection,
    EditorView,
    keymap,
} from "@codemirror/view";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils";
import {
    codeMirrorJmespathHighlighting,
    codeMirrorTemplateHighlighting,
} from "../syntax/codemirror-template-highlighting";
import {
    HighlightedExpression,
    type HighlightedExpressionLanguage,
    JMESPATH_LANGUAGE,
    REMORA_TEMPLATE_LANGUAGE,
} from "../syntax/highlighted-expression";
import { syncValue, useCodemirror } from "./codemirror/use-codemirror";
import { buildEditorTheme, buildJsonEditorTheme } from "./codemirror-theme";

export interface CodeInputProps {
    value: string;
    onChange?: (value: string) => void;
    className?: string;
    placeholder?: string;
    multiline?: boolean;
    onBlur?: () => void;
    onFocus?: () => void;
    highlightLanguage?: HighlightedExpressionLanguage;
    appearance?: "default" | "json";
    readOnly?: boolean;
    onEditorViewChange?: (view: EditorView | null) => void;
}

export function CodeInput({
    value,
    onChange,
    className,
    placeholder,
    multiline = false,
    onBlur,
    onFocus,
    highlightLanguage,
    appearance = "default",
    readOnly = false,
    onEditorViewChange,
}: CodeInputProps) {
    const placeholderRef = useRef(placeholder);
    const maxH = multiline ? "200px" : "120px";
    const usesCodeMirrorTemplateHighlighting =
        appearance === "json" && highlightLanguage === REMORA_TEMPLATE_LANGUAGE;
    const usesCodeMirrorJmespathHighlighting =
        appearance === "json" && highlightLanguage === JMESPATH_LANGUAGE;
    const usesCodeMirrorHighlighting =
        usesCodeMirrorTemplateHighlighting ||
        usesCodeMirrorJmespathHighlighting;

    const extensions = useCallback(
        (_themeCompartment: Compartment) => {
            const exts = [
                drawSelection(),
                bracketMatching(),
                EditorView.lineWrapping,
            ];
            if (readOnly) {
                exts.push(
                    EditorState.readOnly.of(true),
                    EditorView.editable.of(false),
                );
            } else {
                exts.push(
                    history(),
                    closeBrackets(),
                    keymap.of([
                        ...closeBracketsKeymap,
                        ...defaultKeymap,
                        ...historyKeymap,
                    ]),
                );
            }
            if (usesCodeMirrorTemplateHighlighting) {
                exts.push(codeMirrorTemplateHighlighting);
            }
            if (usesCodeMirrorJmespathHighlighting) {
                exts.push(codeMirrorJmespathHighlighting);
            }
            if (placeholderRef.current) {
                exts.push(cmPlaceholder(placeholderRef.current));
            }
            return exts;
        },
        [
            readOnly,
            usesCodeMirrorJmespathHighlighting,
            usesCodeMirrorTemplateHighlighting,
        ],
    );

    const maxHRef = useRef(maxH);
    const [scrollPosition, setScrollPosition] = useState({ left: 0, top: 0 });
    const buildTheme = useCallback(
        (dark: boolean) =>
            appearance === "json"
                ? buildJsonEditorTheme(dark, maxHRef.current)
                : buildEditorTheme(dark, maxHRef.current),
        [appearance],
    );

    const { containerRef, viewRef } = useCodemirror({
        initialValue: value,
        extensions,
        buildTheme,
        onChange,
        onBlur,
        onFocus,
        onScroll: (scrollLeft, scrollTop) =>
            setScrollPosition({ left: scrollLeft, top: scrollTop }),
    });

    useEffect(() => syncValue(viewRef, value), [value, viewRef]);
    useEffect(() => {
        onEditorViewChange?.(viewRef.current);
        return () => onEditorViewChange?.(null);
    }, [onEditorViewChange, viewRef]);

    if (!highlightLanguage || usesCodeMirrorHighlighting) {
        return (
            <div ref={containerRef} className={cn("code-input", className)} />
        );
    }

    return (
        <div className="relative">
            <HighlightedExpression
                value={value}
                language={highlightLanguage}
                mode="overlay"
                overlayKind="code"
                scrollLeft={scrollPosition.left}
                scrollTop={scrollPosition.top}
                className={cn(
                    appearance === "json" ? "z-20" : "z-0",
                    appearance === "json" && "code-input-json-appearance",
                )}
            />
            <div
                ref={containerRef}
                className={cn(
                    "code-input code-input-syntax-highlighted relative z-10",
                    appearance === "default" &&
                        "code-input-transparent-background",
                    appearance === "default" && "code-input-overlay-only",
                    className,
                )}
            />
        </div>
    );
}

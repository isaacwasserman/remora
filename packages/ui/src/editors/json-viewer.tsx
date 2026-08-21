import { json } from "@codemirror/lang-json";
import { syntaxHighlighting } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useCallback, useEffect } from "react";
import { cn } from "../lib/utils";
import { syncValue, useCodemirror } from "./codemirror/use-codemirror";
import { buildJsonHighlightStyle } from "./codemirror-theme";

function buildViewerTheme(dark: boolean) {
    const viewerTheme = EditorView.theme(
        {
            "&": {
                fontSize: "12px",
                fontFamily:
                    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
                borderRadius: "calc(var(--radius) - 2px)",
                border: "1px solid var(--color-border, var(--border))",
                backgroundColor: "var(--color-muted, var(--muted))",
            },
            "&.cm-focused": { outline: "none" },
            ".cm-content": {
                padding: "8px 0",
                color: "var(--color-foreground, var(--foreground))",
                cursor: "default",
            },
            ".cm-line": { padding: "0 10px" },
            ".cm-scroller": { maxHeight: "200px", overflow: "auto" },
            ".cm-activeLine": { backgroundColor: "transparent" },
            ".cm-cursor": { display: "none" },
        },
        { dark },
    );
    return [viewerTheme, syntaxHighlighting(buildJsonHighlightStyle(dark))];
}

export interface JsonViewerProps {
    value: string | undefined;
    className?: string;
}

export function JsonViewer({ value, className }: JsonViewerProps) {
    const hidden = !value;

    const extensions = useCallback(
        () => [
            json(),
            EditorState.readOnly.of(true),
            EditorView.editable.of(false),
            EditorView.lineWrapping,
        ],
        [],
    );

    const buildTheme = useCallback(
        (dark: boolean) => buildViewerTheme(dark),
        [],
    );

    const { containerRef, viewRef } = useCodemirror({
        initialValue: value ?? "",
        extensions,
        buildTheme,
    });

    useEffect(() => syncValue(viewRef, value ?? ""), [value, viewRef]);

    return (
        <div
            ref={containerRef}
            className={cn("json-viewer", className)}
            style={hidden ? { display: "none" } : undefined}
        />
    );
}

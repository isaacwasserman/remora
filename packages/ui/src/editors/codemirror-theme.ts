import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

export function buildJsonHighlightStyle(dark: boolean) {
  return HighlightStyle.define([
    {
      tag: tags.propertyName,
      color: dark ? "#7dd3fc" : "#0369a1", // sky-300 / sky-700
    },
    {
      tag: tags.string,
      color: dark ? "#86efac" : "#15803d", // green-300 / green-700
    },
    {
      tag: tags.number,
      color: dark ? "#c4b5fd" : "#7c3aed", // violet-300 / violet-600
    },
    {
      tag: [tags.bool, tags.null],
      color: dark ? "#fdba74" : "#c2410c", // orange-300 / orange-700
    },
    {
      tag: tags.punctuation,
      color: "var(--color-muted-foreground, var(--muted-foreground))",
    },
  ]);
}

export function buildEditorTheme(
  dark: boolean,
  scrollerMaxHeight?: string,
): Extension[] {
  const editorTheme = EditorView.theme(
    {
      "&": {
        fontSize: "12px",
        fontFamily:
          'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
        borderRadius: "calc(var(--radius) - 2px)",
        border: "1px solid var(--color-border, var(--border))",
        backgroundColor: dark
          ? "var(--color-input, var(--input))"
          : "var(--color-background, var(--background))",
      },
      "&.cm-focused": {
        outline: "none",
        borderColor: "var(--color-ring, var(--ring))",
        boxShadow:
          "0 0 0 3px color-mix(in srgb, var(--color-ring, var(--ring)) 50%, transparent)",
      },
      ".cm-content": {
        padding: "8px 0",
        caretColor: "var(--color-foreground, var(--foreground))",
        color: "var(--color-foreground, var(--foreground))",
      },
      ".cm-cursor": {
        borderLeftColor: "var(--color-foreground, var(--foreground))",
      },
      ".cm-gutters": {
        backgroundColor: "transparent",
        borderRight: "none",
        color: "var(--color-muted-foreground, var(--muted-foreground))",
        paddingLeft: "2px",
      },
      ".cm-lineNumbers .cm-gutterElement": {
        paddingRight: "4px",
        minWidth: "16px",
      },
      ".cm-activeLineGutter": {
        backgroundColor: "transparent",
        color: "var(--color-foreground, var(--foreground))",
      },
      ".cm-activeLine": {
        backgroundColor: dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)",
      },
      ".cm-selectionBackground": {
        backgroundColor: dark
          ? "rgba(255,255,255,0.1) !important"
          : "rgba(0,0,0,0.1) !important",
      },
      ".cm-line": {
        padding: "0 8px",
      },
      ".cm-lintRange-error": {
        backgroundImage: "none",
        textDecoration:
          "wavy underline var(--color-destructive, var(--destructive))",
        textDecorationSkipInk: "none",
      },
      ".cm-lint-marker-error": {
        content: "'!'",
      },
      ".cm-tooltip-lint": {
        backgroundColor: "var(--color-popover, var(--popover))",
        border: "1px solid var(--color-border, var(--border))",
        borderRadius: "calc(var(--radius) - 2px)",
        color: "var(--color-popover-foreground, var(--popover-foreground))",
        fontSize: "11px",
      },
      ".cm-diagnostic-error": {
        borderLeft: "3px solid var(--color-destructive, var(--destructive))",
        color: "var(--color-destructive, var(--destructive))",
      },
      ".cm-placeholder": {
        color: "var(--color-muted-foreground, var(--muted-foreground))",
      },
      ".cm-scroller": {
        maxHeight: scrollerMaxHeight ?? "300px",
        overflow: "auto",
      },
    },
    { dark },
  );

  return [editorTheme, syntaxHighlighting(buildJsonHighlightStyle(dark))];
}

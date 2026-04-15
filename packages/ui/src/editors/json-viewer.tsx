import { json } from "@codemirror/lang-json";
import { syntaxHighlighting } from "@codemirror/language";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useEffect, useRef } from "react";
import { cn } from "../lib/utils";
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
      ".cm-line": {
        padding: "0 10px",
      },
      ".cm-scroller": {
        maxHeight: "200px",
        overflow: "auto",
      },
      ".cm-activeLine": {
        backgroundColor: "transparent",
      },
      ".cm-cursor": {
        display: "none",
      },
    },
    { dark },
  );

  return [viewerTheme, syntaxHighlighting(buildJsonHighlightStyle(dark))];
}

export interface JsonViewerProps {
  /** JSON string to display. When empty/undefined the viewer stays mounted but hidden. */
  value: string | undefined;
  className?: string;
}

export function JsonViewer({ value, className }: JsonViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartmentRef = useRef(new Compartment());
  const initialValueRef = useRef(value ?? "");
  const hidden = !value;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (viewRef.current) return;

    const dark =
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark");

    const state = EditorState.create({
      doc: initialValueRef.current,
      extensions: [
        json(),
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
        EditorView.lineWrapping,
        themeCompartmentRef.current.of(buildViewerTheme(dark)),
      ],
    });

    const view = new EditorView({ state, parent: container });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const doc = value ?? "";
    const current = view.state.doc.toString();
    if (current !== doc) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: doc },
      });
    }
  }, [value]);

  useEffect(() => {
    const el = document.documentElement;
    const observer = new MutationObserver(() => {
      const view = viewRef.current;
      if (!view) return;
      const dark = el.classList.contains("dark");
      view.dispatch({
        effects: themeCompartmentRef.current.reconfigure(
          buildViewerTheme(dark),
        ),
      });
    });
    observer.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn("json-viewer", className)}
      style={hidden ? { display: "none" } : undefined}
    />
  );
}

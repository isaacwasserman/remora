import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import {
  bracketMatching,
  foldKeymap,
  indentOnInput,
} from "@codemirror/language";
import { linter } from "@codemirror/lint";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  placeholder,
} from "@codemirror/view";
import { useEffect, useRef } from "react";
import { cn } from "../lib/utils";
import { buildEditorTheme } from "./codemirror-theme";

export interface JsonCodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholderText?: string;
  onBlur?: () => void;
  /** Max height for the scrollable area. Defaults to "300px". Use "none" for unconstrained. */
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
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartmentRef = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  const onBlurRef = useRef(onBlur);
  const initialValueRef = useRef(value);
  const placeholderRef = useRef(placeholderText);
  const maxHeightRef = useRef(maxHeight);

  onChangeRef.current = onChange;
  onBlurRef.current = onBlur;

  // Create editor on mount
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (viewRef.current) return;

    const dark =
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark");

    const extensions: Extension[] = [
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
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current(update.state.doc.toString());
        }
        if (update.focusChanged && !update.view.hasFocus) {
          onBlurRef.current?.();
        }
      }),
      EditorView.lineWrapping,
      themeCompartmentRef.current.of(
        buildEditorTheme(dark, maxHeightRef.current),
      ),
    ];

    if (placeholderRef.current) {
      extensions.push(placeholder(placeholderRef.current));
    }

    const state = EditorState.create({
      doc: initialValueRef.current,
      extensions,
    });

    const view = new EditorView({ state, parent: container });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // Sync external value changes into the editor
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  // Observe dark mode changes and update theme
  useEffect(() => {
    const el = document.documentElement;
    const observer = new MutationObserver(() => {
      const view = viewRef.current;
      if (!view) return;
      const dark = el.classList.contains("dark");
      view.dispatch({
        effects: themeCompartmentRef.current.reconfigure(
          buildEditorTheme(dark, maxHeightRef.current),
        ),
      });
    });
    observer.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className={cn("rf:json-code-editor", className)} />
  );
}

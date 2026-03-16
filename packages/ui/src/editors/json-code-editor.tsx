import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import {
	bracketMatching,
	foldGutter,
	foldKeymap,
	HighlightStyle,
	indentOnInput,
	syntaxHighlighting,
} from "@codemirror/language";
import { linter, lintGutter } from "@codemirror/lint";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
	drawSelection,
	EditorView,
	highlightSpecialChars,
	keymap,
	lineNumbers,
	placeholder,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { useEffect, useRef } from "react";
import { cn } from "../lib/utils";

const themeCompartment = new Compartment();

function buildTheme(dark: boolean): Extension[] {
	const editorTheme = EditorView.theme(
		{
			"&": {
				fontSize: "12px",
				fontFamily:
					'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
				borderRadius: "calc(var(--radius) - 2px)",
				border: "1px solid var(--color-border, hsl(var(--border)))",
				backgroundColor: dark
					? "var(--color-input, hsl(var(--input)))"
					: "var(--color-background, hsl(var(--background)))",
			},
			"&.cm-focused": {
				outline: "none",
				borderColor: "var(--color-ring, hsl(var(--ring)))",
				boxShadow:
					"0 0 0 3px color-mix(in srgb, var(--color-ring, hsl(var(--ring))) 50%, transparent)",
			},
			".cm-content": {
				padding: "8px 0",
				caretColor: "var(--color-foreground, hsl(var(--foreground)))",
				color: "var(--color-foreground, hsl(var(--foreground)))",
			},
			".cm-cursor": {
				borderLeftColor: "var(--color-foreground, hsl(var(--foreground)))",
			},
			".cm-gutters": {
				backgroundColor: "transparent",
				borderRight: "none",
				color: "var(--color-muted-foreground, hsl(var(--muted-foreground)))",
				paddingLeft: "4px",
			},
			".cm-activeLineGutter": {
				backgroundColor: "transparent",
				color: "var(--color-foreground, hsl(var(--foreground)))",
			},
			".cm-activeLine": {
				backgroundColor: dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)",
			},
			".cm-selectionBackground": {
				backgroundColor: dark
					? "rgba(255,255,255,0.1) !important"
					: "rgba(0,0,0,0.1) !important",
			},
			".cm-foldGutter .cm-gutterElement": {
				padding: "0 2px",
				cursor: "pointer",
			},
			".cm-line": {
				padding: "0 8px",
			},
			".cm-lintRange-error": {
				backgroundImage: "none",
				textDecoration:
					"wavy underline var(--color-destructive, hsl(var(--destructive)))",
				textDecorationSkipInk: "none",
			},
			".cm-lint-marker-error": {
				content: "'!'",
			},
			".cm-tooltip-lint": {
				backgroundColor: "var(--color-popover, hsl(var(--popover)))",
				border: "1px solid var(--color-border, hsl(var(--border)))",
				borderRadius: "calc(var(--radius) - 2px)",
				color:
					"var(--color-popover-foreground, hsl(var(--popover-foreground)))",
				fontSize: "11px",
			},
			".cm-diagnostic-error": {
				borderLeft:
					"3px solid var(--color-destructive, hsl(var(--destructive)))",
				color: "var(--color-destructive, hsl(var(--destructive)))",
			},
			".cm-placeholder": {
				color: "var(--color-muted-foreground, hsl(var(--muted-foreground)))",
			},
			".cm-scroller": {
				maxHeight: "300px",
				overflow: "auto",
			},
		},
		{ dark },
	);

	const highlightStyle = HighlightStyle.define([
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
			color: "var(--color-muted-foreground, hsl(var(--muted-foreground)))",
		},
	]);

	return [editorTheme, syntaxHighlighting(highlightStyle)];
}

export interface JsonCodeEditorProps {
	value: string;
	onChange: (value: string) => void;
	className?: string;
	placeholderText?: string;
	onBlur?: () => void;
}

export function JsonCodeEditor({
	value,
	onChange,
	className,
	placeholderText,
	onBlur,
}: JsonCodeEditorProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const viewRef = useRef<EditorView | null>(null);
	const onChangeRef = useRef(onChange);
	const onBlurRef = useRef(onBlur);
	const initialValueRef = useRef(value);
	const placeholderRef = useRef(placeholderText);

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
			foldGutter(),
			json(),
			linter(jsonParseLinter(), { delay: 300 }),
			lintGutter(),
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
			themeCompartment.of(buildTheme(dark)),
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
				effects: themeCompartment.reconfigure(buildTheme(dark)),
			});
		});
		observer.observe(el, { attributes: true, attributeFilter: ["class"] });
		return () => observer.disconnect();
	}, []);

	return (
		<div ref={containerRef} className={cn("json-code-editor", className)} />
	);
}

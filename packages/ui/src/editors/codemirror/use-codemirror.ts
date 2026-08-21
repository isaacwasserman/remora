import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useEffect, useRef } from "react";

export interface UseCodemirrorOptions {
    initialValue: string;
    extensions: (themeCompartment: Compartment) => Extension[];
    buildTheme: (dark: boolean) => Extension;
    onChange?: (value: string) => void;
    onBlur?: () => void;
}

export function useCodemirror({
    initialValue,
    extensions,
    buildTheme,
    onChange,
    onBlur,
}: UseCodemirrorOptions) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const themeCompartmentRef = useRef(new Compartment());
    const onChangeRef = useRef(onChange);
    const onBlurRef = useRef(onBlur);
    const initialValueRef = useRef(initialValue);

    onChangeRef.current = onChange;
    onBlurRef.current = onBlur;

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        if (viewRef.current) return;

        const dark =
            typeof document !== "undefined" &&
            document.documentElement.classList.contains("dark");

        const exts = extensions(themeCompartmentRef.current);
        exts.push(themeCompartmentRef.current.of(buildTheme(dark)));

        if (onChangeRef.current || onBlurRef.current) {
            exts.push(
                EditorView.updateListener.of((update) => {
                    if (update.docChanged) {
                        onChangeRef.current?.(update.state.doc.toString());
                    }
                    if (update.focusChanged && !update.view.hasFocus) {
                        onBlurRef.current?.();
                    }
                }),
            );
        }

        const state = EditorState.create({
            doc: initialValueRef.current,
            extensions: exts,
        });

        const view = new EditorView({ state, parent: container });
        viewRef.current = view;

        return () => {
            view.destroy();
            viewRef.current = null;
        };
    }, [extensions, buildTheme]);

    useEffect(() => {
        const el = document.documentElement;
        const observer = new MutationObserver(() => {
            const view = viewRef.current;
            if (!view) return;
            const dark = el.classList.contains("dark");
            view.dispatch({
                effects: themeCompartmentRef.current.reconfigure(
                    buildTheme(dark),
                ),
            });
        });
        observer.observe(el, { attributes: true, attributeFilter: ["class"] });
        return () => observer.disconnect();
    }, [buildTheme]);

    return { containerRef, viewRef };
}

export function syncValue(
    viewRef: React.RefObject<EditorView | null>,
    value: string,
) {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
        view.dispatch({
            changes: { from: 0, to: current.length, insert: value },
        });
    }
}

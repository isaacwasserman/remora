import type { EditorView } from "@codemirror/view";
import { REMORA_TEMPLATE_LANGUAGE } from "../syntax/highlighted-expression";
import { CodeInput } from "./code-input";

export interface TemplateCodeEditorProps {
    value: string;
    onChange?: (value: string) => void;
    placeholder?: string;
    className?: string;
    readOnly?: boolean;
    onEditorViewChange?: (view: EditorView | null) => void;
}

/**
 * The common template surface for both step-details and step-editing modes.
 * Read-only mode only disables CodeMirror editing extensions; layout and
 * highlighting remain identical.
 */
export function TemplateCodeEditor({
    value,
    onChange,
    placeholder,
    className,
    readOnly = onChange === undefined,
    onEditorViewChange,
}: TemplateCodeEditorProps) {
    return (
        <CodeInput
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            className={className}
            multiline
            readOnly={readOnly}
            onEditorViewChange={onEditorViewChange}
            appearance="json"
            highlightLanguage={REMORA_TEMPLATE_LANGUAGE}
        />
    );
}

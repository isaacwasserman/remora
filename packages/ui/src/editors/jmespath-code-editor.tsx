import type { EditorView } from "@codemirror/view";
import { cn } from "../lib/utils";
import { JMESPATH_LANGUAGE } from "../syntax/highlighted-expression";
import { CodeInput } from "./code-input";

export interface JmespathCodeEditorProps {
    value: string;
    onChange?: (value: string) => void;
    placeholder?: string;
    className?: string;
    readOnly?: boolean;
    onBlur?: () => void;
    onFocus?: () => void;
    onEditorViewChange?: (view: EditorView | null) => void;
}

/** Common JMESPath surface for read-only details and editable expressions. */
export function JmespathCodeEditor({
    value,
    onChange,
    placeholder,
    className,
    readOnly = onChange === undefined,
    onBlur,
    onFocus,
    onEditorViewChange,
}: JmespathCodeEditorProps) {
    return (
        <CodeInput
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            className={cn("jmespath-code-editor", className)}
            readOnly={readOnly}
            onBlur={onBlur}
            onFocus={onFocus}
            onEditorViewChange={onEditorViewChange}
            appearance="json"
            highlightLanguage={JMESPATH_LANGUAGE}
        />
    );
}

import { JsonEditor, type JsonEditorProps } from "./json-editor";

export interface JsonCodeEditorProps
    extends Omit<JsonEditorProps, "onChange" | "value"> {
    value: string;
    onChange: (value: string) => void;
}

export function JsonCodeEditor({
    value,
    onChange,
    ...props
}: JsonCodeEditorProps) {
    return <JsonEditor value={value} onChange={onChange} {...props} />;
}

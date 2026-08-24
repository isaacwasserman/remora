import { JsonEditor } from "./json-editor";

export interface JsonViewerProps {
    value: string | undefined;
    className?: string;
}

export function JsonViewer({ value, className }: JsonViewerProps) {
    return <JsonEditor value={value} className={className} />;
}

import type { WorkflowDefinition } from "@remoraflow/core";
import { Copy, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { JsonCodeEditor } from "../editors/json-code-editor";

export interface WorkflowJsonDialogProps {
  workflow: WorkflowDefinition | null;
  isEditing: boolean;
  onApply: (workflow: WorkflowDefinition) => void;
  onClose: () => void;
}

export function WorkflowJsonDialog({
  workflow,
  isEditing,
  onApply,
  onClose,
}: WorkflowJsonDialogProps) {
  const [jsonText, setJsonText] = useState(() =>
    JSON.stringify(workflow, null, 2),
  );
  const [parseError, setParseError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus trap
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  // Validate JSON on change
  useEffect(() => {
    try {
      JSON.parse(jsonText);
      setParseError(null);
    } catch (e) {
      setParseError((e as Error).message);
    }
  }, [jsonText]);

  const handleApply = useCallback(() => {
    try {
      const parsed = JSON.parse(jsonText);
      onApply(parsed as WorkflowDefinition);
      onClose();
    } catch (e) {
      setParseError((e as Error).message);
    }
  }, [jsonText, onApply, onClose]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(jsonText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [jsonText]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && isEditing) {
        e.preventDefault();
        handleApply();
      }
    },
    [onClose, isEditing, handleApply],
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={handleKeyDown}
      ref={dialogRef}
      tabIndex={-1}
    >
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl mx-4 overflow-hidden flex flex-col max-h-[80vh]">
        <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">
            Workflow JSON
          </h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleCopy}
              className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-muted/50 transition-colors flex items-center gap-1"
            >
              <Copy className="w-3.5 h-3.5" />
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted/50 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          <JsonCodeEditor
            value={jsonText}
            onChange={setJsonText}
            maxHeight="none"
            placeholderText='{"name": "my-workflow", "steps": []}'
          />
        </div>

        {parseError && (
          <div className="px-5 pb-2">
            <div className="text-[11px] text-destructive bg-destructive/10 rounded-md px-3 py-1.5 truncate">
              {parseError}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border bg-muted/30">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-md text-xs font-medium h-8 px-3 border border-border bg-background hover:bg-muted/50 transition-colors text-foreground"
          >
            {isEditing ? "Cancel" : "Close"}
          </button>
          {isEditing && (
            <button
              type="button"
              onClick={handleApply}
              disabled={!!parseError}
              className="inline-flex items-center justify-center rounded-md text-xs font-medium h-8 px-3 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none"
            >
              Apply
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

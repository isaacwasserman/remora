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
      className="rf:fixed rf:inset-0 rf:z-50 rf:flex rf:items-center rf:justify-center rf:bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={handleKeyDown}
      ref={dialogRef}
      tabIndex={-1}
    >
      <div className="rf:bg-card border rf:border-border rf:rounded-xl rf:shadow-xl rf:w-full rf:max-w-2xl rf:mx-4 rf:overflow-hidden rf:flex rf:flex-col rf:max-h-[80vh]">
        <div className="rf:px-5 rf:pt-4 rf:pb-3 rf:flex rf:items-center rf:justify-between rf:border-b rf:border-border">
          <h2 className="rf:text-sm rf:font-semibold rf:text-foreground">
            Workflow JSON
          </h2>
          <div className="rf:flex rf:items-center rf:gap-1">
            <button
              type="button"
              onClick={handleCopy}
              className="rf:text-xs rf:text-muted-foreground rf:hover:text-foreground rf:px-2 rf:py-1 rf:rounded-md rf:hover:bg-muted/50 rf:transition-colors rf:flex rf:items-center rf:gap-1"
            >
              <Copy className="rf:w-3.5 rf:h-3.5" />
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rf:text-muted-foreground rf:hover:text-foreground rf:p-1 rf:rounded-md rf:hover:bg-muted/50 rf:transition-colors"
            >
              <X className="rf:w-4 rf:h-4" />
            </button>
          </div>
        </div>

        <div className="rf:flex-1 rf:min-h-0 rf:overflow-y-auto rf:p-4">
          <JsonCodeEditor
            value={jsonText}
            onChange={setJsonText}
            maxHeight="none"
            placeholderText='{"name": "my-workflow", "steps": []}'
          />
        </div>

        {parseError && (
          <div className="rf:px-5 rf:pb-2">
            <div className="rf:text-[11px] rf:text-destructive rf:bg-destructive/10 rf:rounded-md rf:px-3 rf:py-1.5 rf:truncate">
              {parseError}
            </div>
          </div>
        )}

        <div className="rf:flex rf:justify-end rf:gap-2 rf:px-5 rf:py-3 rf:border-t rf:border-border rf:bg-muted/30">
          <button
            type="button"
            onClick={onClose}
            className="rf:inline-flex rf:items-center rf:justify-center rf:rounded-md rf:text-xs rf:font-medium rf:h-8 rf:px-3 border rf:border-border rf:bg-background rf:hover:bg-muted/50 rf:transition-colors rf:text-foreground"
          >
            {isEditing ? "Cancel" : "Close"}
          </button>
          {isEditing && (
            <button
              type="button"
              onClick={handleApply}
              disabled={!!parseError}
              className="rf:inline-flex rf:items-center rf:justify-center rf:rounded-md rf:text-xs rf:font-medium rf:h-8 rf:px-3 rf:bg-primary rf:text-primary-foreground rf:hover:bg-primary/90 rf:transition-colors rf:disabled:opacity-50 rf:disabled:pointer-events-none"
            >
              Apply
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

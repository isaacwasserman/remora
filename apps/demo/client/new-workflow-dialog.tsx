import type { ToolDefinitionMap } from "@remoraflow/core";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@remoraflow/ui";
import { ChevronRight, PenLine, Sparkles, Wrench } from "lucide-react";
import { useState } from "react";

type Step = "choose" | "generate";

export interface NewWorkflowDialogProps {
  onBuildManually: () => void;
  onGenerate: (task: string) => void;
  onCancel: () => void;
  isGenerating: boolean;
  error: string | null;
  hasApiKey: boolean;
  onOpenSettings: () => void;
  toolSchemas: ToolDefinitionMap;
}

export function NewWorkflowDialog({
  onBuildManually,
  onGenerate,
  onCancel,
  isGenerating,
  error,
  hasApiKey,
  onOpenSettings,
  toolSchemas,
}: NewWorkflowDialogProps) {
  const [step, setStep] = useState<Step>("choose");
  const [prompt, setPrompt] = useState("");

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isGenerating) onCancel();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !isGenerating) onCancel();
      }}
    >
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
        {step === "choose" ? (
          <>
            <div className="px-5 pt-5 pb-3">
              <h2 className="text-sm font-semibold text-foreground">
                New Workflow
              </h2>
              <p className="text-[11px] text-muted-foreground mt-1">
                How would you like to get started?
              </p>
            </div>

            <div className="px-5 pb-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={onBuildManually}
                className="flex flex-col items-start gap-2 rounded-lg border border-border bg-background hover:bg-accent hover:border-ring transition-colors p-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-center justify-center size-8 rounded-md bg-muted">
                  <PenLine className="size-4 text-muted-foreground" />
                </div>
                <div>
                  <div className="text-xs font-medium text-foreground">
                    Build manually
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Start from a blank canvas and add steps yourself.
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setStep("generate")}
                className="flex flex-col items-start gap-2 rounded-lg border border-border bg-background hover:bg-accent hover:border-ring transition-colors p-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-center justify-center size-8 rounded-md bg-muted">
                  <Sparkles className="size-4 text-muted-foreground" />
                </div>
                <div>
                  <div className="text-xs font-medium text-foreground">
                    Build from a prompt
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Describe your workflow and let the LLM generate it.
                  </div>
                  {!hasApiKey && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
                      Requires an API key
                    </p>
                  )}
                </div>
              </button>
            </div>

            <div className="flex justify-end px-5 py-3 border-t border-border bg-muted/30">
              <Button variant="outline" size="sm" onClick={onCancel}>
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="px-5 pt-5 pb-3">
              <h2 className="text-sm font-semibold text-foreground">
                Build from a prompt
              </h2>
              <p className="text-[11px] text-muted-foreground mt-1">
                Describe the workflow you want and the LLM will generate it
                using the available tools.
              </p>
            </div>

            <div className="px-5 pb-4">
              {!hasApiKey && (
                <div className="mb-3 flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-300">
                  <span>
                    An OpenRouter API key is required to generate workflows.
                  </span>
                  <Button variant="outline" size="xs" onClick={onOpenSettings}>
                    Open Settings
                  </Button>
                </div>
              )}
              <Collapsible className="mb-3">
                <CollapsibleTrigger className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors group w-full">
                  <ChevronRight className="size-3 transition-transform group-data-[state=open]:rotate-90" />
                  <Wrench className="size-3" />
                  <span>
                    Available tools ({Object.keys(toolSchemas).length})
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-1.5 rounded-md border border-border bg-muted/30 divide-y divide-border overflow-hidden data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0">
                  {Object.entries(toolSchemas).map(([name, t]) => (
                    <div key={name} className="px-3 py-1.5">
                      <span className="text-[11px] font-medium text-foreground font-mono">
                        {name}
                      </span>
                      <p className="text-[10px] text-muted-foreground leading-snug">
                        {t.description}
                      </p>
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>

              <textarea
                // biome-ignore lint/a11y/noAutofocus: intentional focus for dialog
                autoFocus
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    if (prompt.trim() && !isGenerating)
                      onGenerate(prompt.trim());
                  }
                }}
                rows={4}
                className="text-xs rounded-md border border-border bg-background px-3 py-2 w-full resize-y focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/60"
                placeholder="e.g. Look up the weather in Tokyo and New York, then compare them using the LLM..."
                disabled={isGenerating}
              />
              {error && (
                <div className="mt-2 text-xs p-2.5 rounded-md bg-red-50 text-red-700 border border-red-200/80 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800/60 flex items-center justify-between gap-2">
                  <span>{error}</span>
                  {!hasApiKey && (
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={onOpenSettings}
                      className="shrink-0"
                    >
                      Open Settings
                    </Button>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-between gap-2 px-5 py-3 border-t border-border bg-muted/30">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep("choose")}
                disabled={isGenerating}
              >
                ← Back
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onCancel}
                  disabled={isGenerating}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => onGenerate(prompt.trim())}
                  disabled={!prompt.trim() || isGenerating}
                >
                  {isGenerating ? "Generating..." : "Generate"}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

import type {
  Diagnostic,
  ToolDefinitionMap,
  WorkflowStep,
} from "@remoraflow/core";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { AgentLoopParams } from "../editors/params/agent-loop-params";
import { EndParams } from "../editors/params/end-params";
import { ExtractDataParams } from "../editors/params/extract-data-params";
import { ForEachParams } from "../editors/params/for-each-params";
import { LlmPromptParams } from "../editors/params/llm-prompt-params";
import { SleepParams } from "../editors/params/sleep-params";
import { StartParams } from "../editors/params/start-params";
import { SwitchCaseParams } from "../editors/params/switch-case-params";
import { ToolCallParams } from "../editors/params/tool-call-params";
import { WaitForConditionParams } from "../editors/params/wait-for-condition-params";
import { StepIdInput } from "../editors/shared-editors";
import { Label, SectionHeader, TypeBadge } from "./shared";

export interface StepEditorPanelProps {
  step: WorkflowStep;
  availableToolNames: string[];
  allStepIds: string[];
  toolSchemas?: ToolDefinitionMap;
  diagnostics?: Diagnostic[];
  workflowInputSchema?: object;
  workflowOutputSchema?: object;
  onChange: (updates: Record<string, unknown>) => void;
  onWorkflowMetaChange?: (updates: Record<string, unknown>) => void;
  onClose: () => void;
}

function StepParamsEditor({
  step,
  onChange,
  availableToolNames,
  allStepIds,
  toolSchemas,
  workflowInputSchema,
  workflowOutputSchema,
  onWorkflowMetaChange,
}: {
  step: WorkflowStep;
  onChange: StepEditorPanelProps["onChange"];
  availableToolNames: string[];
  allStepIds: string[];
  toolSchemas?: ToolDefinitionMap;
  workflowInputSchema?: object;
  workflowOutputSchema?: object;
  onWorkflowMetaChange?: StepEditorPanelProps["onWorkflowMetaChange"];
}) {
  switch (step.type) {
    case "tool-call":
      return (
        <ToolCallParams
          step={step}
          onChange={onChange}
          availableToolNames={availableToolNames}
          toolSchemas={toolSchemas}
        />
      );
    case "llm-prompt":
      return <LlmPromptParams step={step} onChange={onChange} />;
    case "extract-data":
      return <ExtractDataParams step={step} onChange={onChange} />;
    case "switch-case":
      return (
        <SwitchCaseParams
          step={step}
          onChange={onChange}
          allStepIds={allStepIds}
        />
      );
    case "for-each":
      return (
        <ForEachParams
          step={step}
          onChange={onChange}
          allStepIds={allStepIds}
        />
      );
    case "sleep":
      return <SleepParams step={step} onChange={onChange} />;
    case "wait-for-condition":
      return (
        <WaitForConditionParams
          step={step}
          onChange={onChange}
          allStepIds={allStepIds}
        />
      );
    case "agent-loop":
      return (
        <AgentLoopParams
          step={step}
          onChange={onChange}
          availableToolNames={availableToolNames}
          toolSchemas={toolSchemas}
        />
      );
    case "end":
      return (
        <EndParams
          step={step}
          onChange={onChange}
          workflowOutputSchema={workflowOutputSchema}
          onWorkflowMetaChange={onWorkflowMetaChange}
        />
      );
    case "start":
      return (
        <StartParams
          workflowInputSchema={workflowInputSchema}
          onWorkflowMetaChange={onWorkflowMetaChange}
        />
      );
  }
}

function DiagnosticsSection({ diagnostics }: { diagnostics: Diagnostic[] }) {
  if (diagnostics.length === 0) return null;
  const errors = diagnostics.filter((d) => d.severity === "error");
  const warnings = diagnostics.filter((d) => d.severity === "warning");

  return (
    <div className="space-y-1.5">
      {errors.map((d, i) => (
        <div
          key={`err-${d.code}-${i}`}
          className="flex gap-2 items-start text-[11px] text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30 rounded-md px-2.5 py-2 border border-red-200/80 dark:border-red-900/60"
        >
          <span className="shrink-0 font-semibold bg-red-100 dark:bg-red-900/50 px-1.5 py-0.5 rounded text-[10px]">
            Error
          </span>
          <span className="leading-relaxed">{d.message}</span>
        </div>
      ))}
      {warnings.map((d, i) => (
        <div
          key={`warn-${d.code}-${i}`}
          className="flex gap-2 items-start text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 rounded-md px-2.5 py-2 border border-amber-200/80 dark:border-amber-900/60"
        >
          <span className="shrink-0 font-semibold bg-amber-100 dark:bg-amber-900/50 px-1.5 py-0.5 rounded text-[10px]">
            Warn
          </span>
          <span className="leading-relaxed">{d.message}</span>
        </div>
      ))}
    </div>
  );
}

export function StepEditorPanel({
  step,
  availableToolNames,
  allStepIds,
  toolSchemas,
  diagnostics = [],
  workflowInputSchema,
  workflowOutputSchema,
  onChange,
  onWorkflowMetaChange,
  onClose,
}: StepEditorPanelProps) {
  return (
    <div className="w-[360px] border-l h-full min-h-0 overflow-y-auto bg-card border-border">
      <div className="sticky top-0 z-10 border-b px-4 py-3 flex items-center justify-between bg-card/95 backdrop-blur-sm border-border">
        <TypeBadge type={step.type} />
        <button
          type="button"
          onClick={onClose}
          className="text-lg leading-none text-muted-foreground hover:text-foreground shrink-0 rounded-md w-7 h-7 flex items-center justify-center hover:bg-muted transition-colors"
        >
          &times;
        </button>
      </div>

      <div className="px-4 py-4 space-y-5">
        <DiagnosticsSection diagnostics={diagnostics} />

        <div>
          <Label>Name</Label>
          <Input
            value={step.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className="h-9 text-sm"
            placeholder="Step name"
          />
        </div>

        <StepIdInput value={step.id} onChange={(id) => onChange({ id })} />

        <div>
          <Label>Description</Label>
          <Textarea
            value={step.description}
            onChange={(e) => onChange({ description: e.target.value })}
            rows={2}
            className="text-xs resize-y"
            placeholder="What does this step do?"
          />
        </div>

        <div className="border-t pt-4 border-border">
          <SectionHeader>Parameters</SectionHeader>
          <StepParamsEditor
            step={step}
            onChange={onChange}
            availableToolNames={availableToolNames}
            allStepIds={allStepIds}
            toolSchemas={toolSchemas}
            workflowInputSchema={workflowInputSchema}
            workflowOutputSchema={workflowOutputSchema}
            onWorkflowMetaChange={onWorkflowMetaChange}
          />
        </div>
      </div>
    </div>
  );
}

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
    <div className="rf:space-y-1.5">
      {errors.map((d, i) => (
        <div
          key={`rf:err-${d.code}-${i}`}
          className="rf:flex rf:gap-2 rf:items-start rf:text-[11px] rf:text-red-700 rf:dark:text-red-300 rf:bg-red-50 rf:dark:bg-red-950/30 rf:rounded-md rf:px-2.5 rf:py-2 border rf:border-red-200/80 rf:dark:border-red-900/60"
        >
          <span className="rf:shrink-0 rf:font-semibold rf:bg-red-100 rf:dark:bg-red-900/50 rf:px-1.5 rf:py-0.5 rounded rf:text-[10px]">
            Error
          </span>
          <span className="rf:leading-relaxed">{d.message}</span>
        </div>
      ))}
      {warnings.map((d, i) => (
        <div
          key={`rf:warn-${d.code}-${i}`}
          className="rf:flex rf:gap-2 rf:items-start rf:text-[11px] rf:text-amber-700 rf:dark:text-amber-300 rf:bg-amber-50 rf:dark:bg-amber-950/30 rf:rounded-md rf:px-2.5 rf:py-2 border rf:border-amber-200/80 rf:dark:border-amber-900/60"
        >
          <span className="rf:shrink-0 rf:font-semibold rf:bg-amber-100 rf:dark:bg-amber-900/50 rf:px-1.5 rf:py-0.5 rounded rf:text-[10px]">
            Warn
          </span>
          <span className="rf:leading-relaxed">{d.message}</span>
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
    <div className="rf:w-[360px] rf:border-l rf:h-full rf:min-h-0 rf:overflow-y-auto rf:bg-card rf:border-border">
      <div className="rf:sticky rf:top-0 rf:z-10 rf:border-b rf:px-4 rf:py-3 rf:flex rf:items-center rf:justify-between rf:bg-card/95 rf:backdrop-blur-sm rf:border-border">
        <TypeBadge type={step.type} />
        <button
          type="button"
          onClick={onClose}
          className="rf:text-lg rf:leading-none rf:text-muted-foreground rf:hover:text-foreground rf:shrink-0 rf:rounded-md rf:w-7 rf:h-7 rf:flex rf:items-center rf:justify-center rf:hover:bg-muted rf:transition-colors"
        >
          &times;
        </button>
      </div>

      <div className="rf:px-4 rf:py-4 rf:space-y-5">
        <DiagnosticsSection diagnostics={diagnostics} />

        <div>
          <Label>Name</Label>
          <Input
            value={step.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className="rf:h-9 rf:text-sm"
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
            className="rf:text-xs rf:resize-y"
            placeholder="What does this step do?"
          />
        </div>

        <div className="rf:border-t rf:pt-4 rf:border-border">
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

import type {
  ExecutionState,
  ToolDefinitionMap,
  WorkflowDefinition,
} from "@remoraflow/core";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  ReplaySlider,
  Switch,
  useWorkflowExecution,
  WorkflowViewer,
} from "@remoraflow/ui";
import {
  BookOpen,
  ChevronDown,
  Download,
  FolderOpen,
  Github,
  Moon,
  Palette,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Settings,
  Sun,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_WORKFLOW } from "./default-workflow";
import { EXAMPLE_WORKFLOWS } from "./example-workflows";
import { NewWorkflowDialog } from "./new-workflow-dialog";
import { loadApiKey, loadModelId, saveApiKey, saveModelId } from "./openrouter";
import { RemoraflowLogo } from "./remoraflow-logo";
import { orpc } from "./rpc-client";
import { randomizeTheme } from "./theme-randomizer";
import { WorkflowInputDialog, WorkflowOutputPanel } from "./workflow-io-panels";
import {
  clearExecutionState,
  clearWorkflow,
  exportWorkflowJson,
  importWorkflowJson,
  loadExecutionState,
  loadWorkflow,
  saveExecutionState,
  saveWorkflow,
} from "./workflow-store";

const LLM_STEP_TYPES = new Set(["llm-prompt", "extract-data", "agent-loop"]);

function workflowNeedsLLM(wf: WorkflowDefinition): boolean {
  return wf.steps.some((s) => LLM_STEP_TYPES.has((s as { type: string }).type));
}

export function App() {
  const [toolSchemas, setToolSchemas] = useState<ToolDefinitionMap>({});
  useEffect(() => {
    orpc.tools.list.call({}).then(setToolSchemas);
  }, []);

  const [workflow, setWorkflow] = useState<WorkflowDefinition | null>(
    () => loadWorkflow() ?? DEFAULT_WORKFLOW,
  );
  const [isEditing, setIsEditing] = useState(true);
  const [dark, setDark] = useState(false);

  // Settings
  const [apiKey, setApiKey] = useState(loadApiKey);
  const [modelId, setModelId] = useState(loadModelId);
  const [showSettings, setShowSettings] = useState(false);

  // Input state
  const [awaitingInputs, setAwaitingInputs] = useState(false);

  // Generate workflow state
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  // Execution hook
  const persist = useMemo(
    () => ({
      save: saveExecutionState,
      load: loadExecutionState,
      clear: clearExecutionState,
    }),
    [],
  );

  const execution = useWorkflowExecution(workflow, {
    execute: ({ workflow, inputs, initialState }) =>
      orpc.workflow.execute.call({
        workflow,
        inputs,
        apiKey: apiKey || undefined,
        modelId,
        initialState,
      }) as Promise<AsyncIterable<ExecutionState>>,
    persist,
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const handleWorkflowChange = useCallback((wf: WorkflowDefinition) => {
    setWorkflow(wf);
    saveWorkflow(wf);
  }, []);

  const handleRun = useCallback(() => {
    if (!workflow || execution.isRunning) return;
    if (!apiKey && workflowNeedsLLM(workflow)) {
      setRunError(
        "This workflow has LLM-based steps. Please configure an OpenRouter API key in Settings.",
      );
      setShowSettings(true);
      setAwaitingInputs(false);
      return;
    }
    setRunError(null);
    // If the workflow has an input schema with properties, show the input form
    const schema = workflow.inputSchema as
      | { properties?: Record<string, unknown> }
      | undefined;
    if (schema?.properties && Object.keys(schema.properties).length > 0) {
      setAwaitingInputs(true);
      return;
    }
    setIsEditing(false);
    execution.run({});
  }, [workflow, execution, apiKey]);

  const handleStartWithInputs = useCallback(
    (inputs: Record<string, unknown>) => {
      setAwaitingInputs(false);
      setIsEditing(false);
      execution.run(inputs);
    },
    [execution],
  );

  const handlePause = useCallback(() => {
    execution.pause();
  }, [execution]);

  const handleResume = useCallback(() => {
    execution.resume();
  }, [execution]);

  const handleReset = useCallback(() => {
    execution.reset();
    setAwaitingInputs(false);
  }, [execution]);

  const handleExport = useCallback(() => {
    if (workflow) exportWorkflowJson(workflow);
  }, [workflow]);

  const handleImport = useCallback(async () => {
    const imported = await importWorkflowJson();
    if (imported) {
      setWorkflow(imported);
      saveWorkflow(imported);
    }
  }, []);

  const handleClear = useCallback(() => {
    clearWorkflow();
    setWorkflow(null);
    execution.reset();
    setAwaitingInputs(false);
  }, [execution]);

  const handleLoadExample = useCallback(
    (wf: WorkflowDefinition) => {
      handleReset();
      setWorkflow(wf);
      saveWorkflow(wf);
    },
    [handleReset],
  );

  const handleSaveApiKey = useCallback((key: string) => {
    setApiKey(key);
    saveApiKey(key);
    if (key) setRunError(null);
  }, []);

  const handleSaveModelId = useCallback((id: string) => {
    setModelId(id);
    saveModelId(id);
  }, []);

  const handleGenerate = useCallback(
    async (task: string) => {
      if (!apiKey) {
        setGenerateError("Please configure an OpenRouter API key in Settings.");
        return;
      }
      setIsGenerating(true);
      setGenerateError(null);
      try {
        const result = await orpc.workflow.generate.call({
          task,
          apiKey,
          modelId,
          maxRetries: 3,
        });
        if (result.workflow) {
          handleReset();
          setWorkflow(result.workflow);
          saveWorkflow(result.workflow);
          setShowNewDialog(false);
        } else {
          const errors = result.diagnostics
            .filter((d) => d.severity === "error")
            .map((d) => d.message)
            .join("; ");
          setGenerateError(
            `Failed to generate a valid workflow after ${result.attempts} attempt(s). ${errors}`,
          );
        }
      } catch (err) {
        setGenerateError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsGenerating(false);
      }
    },
    [apiKey, modelId, handleReset],
  );

  const isDone =
    execution.executionState?.status === "completed" ||
    execution.executionState?.status === "failed";

  return (
    <div className="h-full flex flex-col bg-background text-foreground">
      {/* Header */}
      <header className="bg-card dark:bg-secondary/40 border-b border-border px-4 py-2.5 flex items-center gap-4 shrink-0">
        <RemoraflowLogo fill="#5F34DC" className="h-10 w-auto" />

        {/* Separator */}
        <div className="w-px h-5 bg-border" />

        {/* Edit / View toggle */}
        <div className="flex items-center gap-2">
          <Switch
            checked={isEditing}
            onCheckedChange={setIsEditing}
            id="edit-toggle"
            size="sm"
          />
          <label
            htmlFor="edit-toggle"
            className="text-xs text-muted-foreground cursor-pointer select-none"
          >
            {isEditing ? "Edit" : "View"}
          </label>
        </div>

        {/* Separator */}
        <div className="w-px h-5 bg-border" />

        {/* Run / Pause / Resume */}
        {execution.isRunning ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={handlePause}
            className="gap-1.5"
          >
            <Pause className="h-3.5 w-3.5" />
            Pause
          </Button>
        ) : execution.isPaused ? (
          <Button
            size="sm"
            onClick={handleResume}
            disabled={!workflow}
            className="gap-1.5"
          >
            <Play className="h-3.5 w-3.5" />
            Resume
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={handleRun}
            disabled={!workflow || execution.isRunning}
            className="gap-1.5"
          >
            <Play className="h-3.5 w-3.5" />
            Run
          </Button>
        )}

        {runError && (
          <span className="text-xs text-amber-600 dark:text-amber-400">
            API key required
          </span>
        )}

        {/* Reset */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleReset}
          disabled={!execution.isRunning && !isDone && !execution.isPaused}
          className="gap-1.5"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </Button>

        {/* Separator */}
        <div className="w-px h-5 bg-border" />

        <div className="flex gap-1">
          {/* Open dropdown: examples + open from file */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground gap-1"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                Open
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Examples</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {EXAMPLE_WORKFLOWS.map((ex) => (
                <DropdownMenuItem
                  key={ex.id}
                  onClick={() => handleLoadExample(ex.workflow)}
                >
                  <div>
                    <div className="font-medium text-xs">
                      {ex.name}
                      {"requiresLLM" in ex && ex.requiresLLM && (
                        <span className="ml-1.5 text-[10px] text-muted-foreground">
                          (LLM)
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {ex.description}
                    </div>
                  </div>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleImport}>
                <Upload className="h-3.5 w-3.5" />
                Open from file…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Export */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExport}
            disabled={!workflow}
            className="text-muted-foreground hover:text-foreground gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>

          {/* New — opens the new-workflow dialog */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setGenerateError(null);
              setShowNewDialog(true);
            }}
            className="text-muted-foreground hover:text-foreground gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            New
          </Button>
        </div>

        {/* Settings */}
        <div className="relative ml-auto flex items-center gap-3">
          <Button
            variant={showSettings ? "default" : "ghost"}
            size="sm"
            onClick={() => setShowSettings((s) => !s)}
            className={
              showSettings
                ? "gap-1.5"
                : "text-muted-foreground hover:text-foreground gap-1.5"
            }
          >
            <Settings className="h-3.5 w-3.5" />
            Settings
            {!apiKey && (
              <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-amber-500" />
            )}
          </Button>
          {showSettings && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-popover border border-border rounded-lg shadow-lg dark:shadow-foreground/[0.04] p-4 z-50">
              <div className="space-y-3">
                <label className="block text-xs font-medium text-muted-foreground">
                  OpenRouter API Key
                  <Input
                    type="password"
                    value={apiKey}
                    onChange={(e) => handleSaveApiKey(e.target.value)}
                    placeholder="sk-or-..."
                    className="mt-1 h-8 text-xs"
                  />
                </label>
                <label className="block text-xs font-medium text-muted-foreground">
                  Model
                  <Input
                    value={modelId}
                    onChange={(e) => handleSaveModelId(e.target.value)}
                    placeholder="anthropic/claude-haiku-4.5"
                    className="mt-1 h-8 text-xs"
                  />
                </label>
                <p className="text-[10px] text-muted-foreground">
                  Required for llm-prompt, extract-data, and agent-loop steps.
                </p>
              </div>
            </div>
          )}

          {/* External links */}
          <Button
            asChild
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-foreground"
            title="Documentation"
          >
            <a href="/">
              <BookOpen className="h-3.5 w-3.5" />
            </a>
          </Button>
          <Button
            asChild
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-foreground"
            title="GitHub"
          >
            <a
              href="https://github.com/isaacwasserman/remora"
              target="_blank"
              rel="noreferrer"
            >
              <Github className="h-3.5 w-3.5" />
            </a>
          </Button>

          {/* Theme controls */}
          <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
            <Button
              variant={dark ? "ghost" : "secondary"}
              size="icon-xs"
              onClick={() => setDark(false)}
              title="Light mode"
              className={dark ? "" : "shadow-sm"}
            >
              <Sun className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={dark ? "secondary" : "ghost"}
              size="icon-xs"
              onClick={() => setDark(true)}
              title="Dark mode"
              className={dark ? "shadow-sm" : ""}
            >
              <Moon className="h-3.5 w-3.5" />
            </Button>
            <div className="w-px h-3.5 bg-border mx-0.5" />
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => randomizeTheme(dark)}
              title="Randomize theme"
            >
              <Palette className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 min-h-0">
          <WorkflowViewer
            workflow={workflow}
            isEditing={isEditing}
            onWorkflowChange={handleWorkflowChange}
            toolSchemas={toolSchemas}
            executionState={execution.executionState ?? undefined}
            paused={execution.isPaused}
          />
        </div>

        {/* Workflow output panel */}
        {execution.executionState && (
          <WorkflowOutputPanel executionState={execution.executionState} />
        )}

        {/* Replay slider */}
        <ReplaySlider
          stateHistory={execution.stateHistory}
          replayIndex={execution.replayIndex}
          isRunning={execution.isRunning}
          onSeek={execution.seekTo}
          onGoLive={execution.goLive}
        />
      </div>

      {/* Input dialog modal */}
      {awaitingInputs && workflow?.inputSchema && (
        <WorkflowInputDialog
          inputSchema={
            workflow.inputSchema as {
              properties?: Record<
                string,
                {
                  type?: string;
                  description?: string;
                  default?: unknown;
                  enum?: unknown[];
                  items?: { type?: string };
                }
              >;
              required?: string[];
            }
          }
          onRun={handleStartWithInputs}
          onCancel={() => setAwaitingInputs(false)}
        />
      )}

      {/* New workflow dialog */}
      {showNewDialog && (
        <NewWorkflowDialog
          onBuildManually={() => {
            setShowNewDialog(false);
            handleClear();
          }}
          onGenerate={handleGenerate}
          onCancel={() => {
            if (!isGenerating) setShowNewDialog(false);
          }}
          isGenerating={isGenerating}
          error={generateError}
          hasApiKey={!!apiKey}
          onOpenSettings={() => {
            setShowNewDialog(false);
            setShowSettings(true);
          }}
          toolSchemas={toolSchemas}
        />
      )}
    </div>
  );
}

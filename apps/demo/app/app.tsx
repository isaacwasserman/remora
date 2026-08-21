import type { ToolDefinitionMap, WorkflowDefinition } from "@remoraflow/core";
import {
    type LayoutDirection,
    useDarkMode,
    useWorkflowExecution,
    WorkflowViewer,
} from "@remoraflow/ui";
import { ReactFlowProvider } from "@xyflow/react";
import { useCallback, useEffect, useState } from "react";
import { AuditDialog } from "./components/audit-dialog.tsx";
import { InputDialog } from "./components/input-dialog.tsx";
import { InterventionDialog } from "./components/intervention-dialog.tsx";
import { NewWorkflowDialog } from "./components/new-workflow-dialog.tsx";
import { OutputPanel } from "./components/output-panel.tsx";
import { SettingsDialog } from "./components/settings-dialog.tsx";
import { Toolbar } from "./components/toolbar.tsx";
import { useWSExecution } from "./hooks/use-ws-execution.ts";
import { rpc } from "./lib/rpc-client.ts";
import { decodeWorkflow, encodeWorkflow } from "./lib/sharing.ts";
import {
    loadActiveWorkflowKey,
    loadLLMConfig,
    saveActiveWorkflowKey,
} from "./lib/storage.ts";
import defaultWorkflow from "./workflows/pokemon-lookup.json";

export function App() {
    const [workflow, setWorkflow] = useState<WorkflowDefinition | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [toolSchemas, setToolSchemas] = useState<ToolDefinitionMap>({});
    const [layout, setLayout] = useState<LayoutDirection>("vertical");
    const [hasLLMConfig, setHasLLMConfig] = useState(
        () => !!loadLLMConfig()?.apiKey,
    );

    const [settingsOpen, setSettingsOpen] = useState(false);
    const [auditOpen, setAuditOpen] = useState(false);
    const [newWorkflowOpen, setNewWorkflowOpen] = useState(false);
    const [inputDialogOpen, setInputDialogOpen] = useState(false);

    const isDark = useDarkMode();

    const { execute, interventionRequest, respondToIntervention } =
        useWSExecution();

    const {
        executionState,
        stateHistory,
        isRunning,
        run,
        reset,
        replayIndex,
        seekTo,
        goLive,
    } = useWorkflowExecution(workflow, { execute });

    useEffect(() => {
        (rpc.tools.list as unknown as () => Promise<ToolDefinitionMap>)()
            .then(setToolSchemas)
            .catch(() => {});
    }, []);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const encoded = params.get("w");
        if (encoded) {
            decodeWorkflow(encoded)
                .then(setWorkflow)
                .catch(() => {
                    setWorkflow(defaultWorkflow as WorkflowDefinition);
                });
            return;
        }

        const lastKey = loadActiveWorkflowKey();
        if (lastKey?.startsWith("demo:pokemon-analyst")) {
            import("./workflows/pokemon-analyst.json").then((m) =>
                setWorkflow(m.default as WorkflowDefinition),
            );
        } else if (lastKey?.startsWith("demo:tournament-prep")) {
            import("./workflows/tournament-prep.json").then((m) =>
                setWorkflow(m.default as WorkflowDefinition),
            );
        } else {
            setWorkflow(defaultWorkflow as WorkflowDefinition);
        }
    }, []);

    const handleWorkflowChange = useCallback((wf: WorkflowDefinition) => {
        setWorkflow(wf);
    }, []);

    const handleLoadWorkflow = useCallback(
        (wf: WorkflowDefinition, key: string) => {
            setWorkflow(wf);
            saveActiveWorkflowKey(key);
            reset();
        },
        [reset],
    );

    const handleRun = useCallback(() => {
        if (!workflow) return;
        const schema = workflow.inputSchema as
            | Record<string, unknown>
            | undefined;
        const hasProperties =
            schema?.properties &&
            Object.keys(schema.properties as object).length > 0;
        if (hasProperties) {
            setInputDialogOpen(true);
        } else {
            run({});
        }
    }, [workflow, run]);

    const handleRunWithInputs = useCallback(
        (inputs: Record<string, unknown>) => {
            run(inputs);
        },
        [run],
    );

    const handleExport = useCallback(() => {
        if (!workflow) return;
        const json = JSON.stringify(workflow, null, 2);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "workflow.json";
        a.click();
        URL.revokeObjectURL(url);
    }, [workflow]);

    const handleShare = useCallback(async () => {
        if (!workflow) return;
        const encoded = await encodeWorkflow(workflow);
        const url = new URL(window.location.href);
        url.searchParams.set("w", encoded);
        await navigator.clipboard.writeText(url.toString());
    }, [workflow]);

    const handleDarkModeToggle = useCallback(() => {
        document.documentElement.classList.toggle("dark");
    }, []);

    return (
        <ReactFlowProvider>
            <div className="h-screen flex flex-col">
                <Toolbar
                    workflow={workflow}
                    isEditing={isEditing}
                    onEditingChange={setIsEditing}
                    isRunning={isRunning}
                    onRun={handleRun}
                    onReset={reset}
                    onLoadWorkflow={handleLoadWorkflow}
                    onExport={handleExport}
                    onShare={handleShare}
                    onNewWorkflow={() => setNewWorkflowOpen(true)}
                    onAudit={() => setAuditOpen(true)}
                    onOpenSettings={() => setSettingsOpen(true)}
                    hasLLMConfig={hasLLMConfig}
                    layout={layout}
                    onLayoutChange={setLayout}
                    isDark={isDark}
                    onDarkModeToggle={handleDarkModeToggle}
                />
                <main className="flex-1 min-h-0">
                    <WorkflowViewer
                        workflow={workflow}
                        isEditing={isEditing}
                        onWorkflowChange={handleWorkflowChange}
                        executionState={executionState ?? undefined}
                        toolSchemas={toolSchemas}
                        paused={false}
                        layout={layout}
                        settings={{ features: { allowUserIntervention: true } }}
                    />
                </main>
                <OutputPanel
                    executionState={executionState}
                    stateHistory={stateHistory}
                    isRunning={isRunning}
                    replayIndex={replayIndex}
                    onSeek={seekTo}
                    onGoLive={goLive}
                />
            </div>

            <SettingsDialog
                open={settingsOpen}
                onOpenChange={setSettingsOpen}
                onSaved={() => setHasLLMConfig(!!loadLLMConfig()?.apiKey)}
            />

            {workflow && (
                <AuditDialog
                    open={auditOpen}
                    onOpenChange={setAuditOpen}
                    workflow={workflow}
                />
            )}

            <NewWorkflowDialog
                open={newWorkflowOpen}
                onOpenChange={setNewWorkflowOpen}
                onCreated={(wf) => {
                    setWorkflow(wf);
                    setIsEditing(true);
                    reset();
                }}
            />

            {workflow?.inputSchema && (
                <InputDialog
                    open={inputDialogOpen}
                    onOpenChange={setInputDialogOpen}
                    inputSchema={
                        workflow.inputSchema as Record<string, unknown>
                    }
                    onRun={handleRunWithInputs}
                />
            )}

            <InterventionDialog
                request={interventionRequest}
                onRespond={respondToIntervention}
            />
        </ReactFlowProvider>
    );
}

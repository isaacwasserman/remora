import type { ExecutionState, WorkflowDefinition } from "@remoraflow/core";
import { executeWorkflow } from "@remoraflow/core";
import { Button, Input, Switch, WorkflowViewer } from "@remoraflow/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { DEFAULT_WORKFLOW } from "./default-workflow";
import {
	createOpenRouterModel,
	loadApiKey,
	loadModelId,
	saveApiKey,
	saveModelId,
} from "./openrouter";
import { DEMO_TOOLS } from "./tools";
import {
	clearWorkflow,
	exportWorkflowJson,
	importWorkflowJson,
	loadWorkflow,
	saveWorkflow,
} from "./workflow-store";

function App() {
	const [workflow, setWorkflow] = useState<WorkflowDefinition | null>(
		() => loadWorkflow() ?? DEFAULT_WORKFLOW,
	);
	const [isEditing, setIsEditing] = useState(true);
	const [executionState, setExecutionState] = useState<ExecutionState | null>(
		null,
	);
	const [isRunning, setIsRunning] = useState(false);
	const [dark, setDark] = useState(false);
	// Replay state
	const [stateHistory, setStateHistory] = useState<ExecutionState[]>([]);
	const [replayIndex, setReplayIndex] = useState<number | null>(null);

	// Settings
	const [apiKey, setApiKey] = useState(loadApiKey);
	const [modelId, setModelId] = useState(loadModelId);
	const [showSettings, setShowSettings] = useState(false);

	const [runError, setRunError] = useState<string | null>(null);
	const abortRef = useRef<AbortController | null>(null);

	useEffect(() => {
		document.documentElement.classList.toggle("dark", dark);
	}, [dark]);

	const handleWorkflowChange = useCallback((wf: WorkflowDefinition) => {
		setWorkflow(wf);
		saveWorkflow(wf);
	}, []);

	const handleRun = useCallback(async () => {
		if (!workflow || isRunning) return;
		setIsRunning(true);
		setIsEditing(false);
		setExecutionState(null);
		setStateHistory([]);
		setReplayIndex(null);
		setRunError(null);

		const ac = new AbortController();
		abortRef.current = ac;

		try {
			await executeWorkflow(workflow, {
				tools: DEMO_TOOLS,
				model: apiKey ? createOpenRouterModel(apiKey, modelId) : undefined,
				onStateChange: (state) => {
					if (ac.signal.aborted) return;
					setStateHistory((prev) => [...prev, state]);
					setReplayIndex((idx) => {
						if (idx === null) setExecutionState(state);
						return idx;
					});
				},
			});
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			setRunError(msg);
		} finally {
			setIsRunning(false);
			abortRef.current = null;
		}
	}, [workflow, isRunning, apiKey, modelId]);

	const handleReset = useCallback(() => {
		abortRef.current?.abort();
		setExecutionState(null);
		setStateHistory([]);
		setReplayIndex(null);
		setIsRunning(false);
		setRunError(null);
	}, []);

	const handleSliderChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const idx = Number(e.target.value);
			const isAtEnd = idx === stateHistory.length - 1;
			setReplayIndex(isAtEnd ? null : idx);
			setExecutionState(stateHistory[idx] as ExecutionState);
		},
		[stateHistory],
	);

	const handleLive = useCallback(() => {
		setReplayIndex(null);
		if (stateHistory.length > 0) {
			setExecutionState(
				stateHistory[stateHistory.length - 1] as ExecutionState,
			);
		}
	}, [stateHistory]);

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
		setExecutionState(null);
		setStateHistory([]);
		setReplayIndex(null);
	}, []);

	const handleSaveApiKey = useCallback((key: string) => {
		setApiKey(key);
		saveApiKey(key);
	}, []);

	const handleSaveModelId = useCallback((id: string) => {
		setModelId(id);
		saveModelId(id);
	}, []);

	const isDone =
		executionState?.status === "completed" ||
		executionState?.status === "failed";

	// Show error from execution state or from caught exception
	const visibleError =
		executionState?.status === "failed"
			? (executionState.error?.message ?? "Workflow failed")
			: runError;

	const showSlider = stateHistory.length > 1;
	const currentIndex = replayIndex ?? stateHistory.length - 1;

	return (
		<div className="h-full flex flex-col bg-background text-foreground">
			{/* Header */}
			<header className="bg-card border-b border-border px-4 py-3 flex items-center gap-3 shrink-0">
				<h1 className="text-sm font-semibold">Remora Flow</h1>

				{/* Edit / View toggle */}
				<div className="flex gap-1 rounded-md bg-muted p-0.5">
					<Button
						variant={isEditing ? "secondary" : "ghost"}
						size="xs"
						onClick={() => setIsEditing(true)}
						className={isEditing ? "shadow-sm" : ""}
					>
						Edit
					</Button>
					<Button
						variant={!isEditing ? "secondary" : "ghost"}
						size="xs"
						onClick={() => setIsEditing(false)}
						className={!isEditing ? "shadow-sm" : ""}
					>
						View
					</Button>
				</div>

				{/* Run / Reset */}
				<div className="flex gap-2">
					{isDone && (
						<Button variant="outline" size="sm" onClick={handleReset}>
							Reset
						</Button>
					)}
					<Button
						size="sm"
						onClick={handleRun}
						disabled={isRunning || !workflow?.steps.length}
					>
						{isRunning ? "Running..." : "Run"}
					</Button>
				</div>

				{/* Export / Import / Clear */}
				<div className="flex gap-1">
					<Button
						variant="outline"
						size="sm"
						onClick={handleExport}
						disabled={!workflow}
					>
						Export
					</Button>
					<Button variant="outline" size="sm" onClick={handleImport}>
						Import
					</Button>
					<Button variant="outline" size="sm" onClick={handleClear}>
						New
					</Button>
				</div>

				{/* Settings */}
				<div className="relative ml-auto flex items-center gap-3">
					<Button
						variant={showSettings ? "default" : "outline"}
						size="sm"
						onClick={() => setShowSettings((s) => !s)}
					>
						Settings
					</Button>
					{showSettings && (
						<div className="absolute right-0 top-full mt-2 w-80 bg-popover border border-border rounded-lg shadow-lg p-4 z-50">
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

					{/* Dark mode toggle */}
					<div className="flex items-center gap-2 text-xs text-muted-foreground select-none">
						<span>Dark</span>
						<Switch checked={dark} onCheckedChange={setDark} size="sm" />
					</div>
				</div>
			</header>

			{/* Error banner */}
			{visibleError && (
				<div className="bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-900 px-4 py-2 flex items-center gap-2 shrink-0">
					<span className="text-xs font-medium text-red-700 dark:text-red-400 flex-1">
						{visibleError}
					</span>
					<Button
						variant="ghost"
						size="xs"
						className="text-red-500 hover:text-red-700 shrink-0"
						onClick={() => setRunError(null)}
					>
						Dismiss
					</Button>
				</div>
			)}

			{/* Main area */}
			<div className="flex-1 flex flex-col min-h-0">
				<div className="flex-1 min-h-0">
					<WorkflowViewer
						workflow={workflow}
						isEditing={isEditing}
						onWorkflowChange={handleWorkflowChange}
						tools={DEMO_TOOLS}
						executionState={executionState ?? undefined}
					/>
				</div>

				{/* Replay slider */}
				{showSlider && (
					<div className="bg-card border-t border-border px-4 py-2 flex items-center gap-3 shrink-0">
						<input
							type="range"
							min={0}
							max={stateHistory.length - 1}
							value={currentIndex}
							onChange={handleSliderChange}
							className="flex-1 h-1.5 accent-primary"
						/>
						<span className="text-xs text-muted-foreground tabular-nums min-w-[60px] text-right">
							{currentIndex + 1} / {stateHistory.length}
						</span>
						{(() => {
							const latestStatus =
								stateHistory.length > 0
									? stateHistory[stateHistory.length - 1]?.status
									: undefined;
							const base =
								"w-[72px] h-[24px] text-[11px] font-medium rounded flex items-center justify-center";
							if (replayIndex !== null) {
								return (
									<Button
										variant="outline"
										size="xs"
										onClick={handleLive}
										className="w-[72px]"
									>
										Live
									</Button>
								);
							}
							if (isRunning) {
								return (
									<span
										className={`${base} text-green-600 dark:text-green-400 gap-1`}
									>
										<span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
										Live
									</span>
								);
							}
							if (latestStatus === "completed") {
								return (
									<span
										className={`${base} text-green-600 dark:text-green-400`}
									>
										Complete
									</span>
								);
							}
							if (latestStatus === "failed") {
								return (
									<span className={`${base} text-red-600 dark:text-red-400`}>
										Failed
									</span>
								);
							}
							return <span className={base} />;
						})()}
					</div>
				)}
			</div>
		</div>
	);
}

const container = document.getElementById("root");
if (container) {
	const root = createRoot(container);
	root.render(<App />);
}

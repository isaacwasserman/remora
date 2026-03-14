import type {
	Diagnostic,
	ExecutionState,
	WorkflowDefinition,
	WorkflowStep,
} from "@remoraflow/core";
import { StepDetailPanel, WorkflowViewer } from "@remoraflow/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

function App() {
	const [names, setNames] = useState<string[]>([]);
	const [executable, setExecutable] = useState<Set<string>>(new Set());
	const [selected, setSelected] = useState(0);
	const [workflow, setWorkflow] = useState<WorkflowDefinition | null>(null);
	const [executionState, setExecutionState] = useState<ExecutionState | null>(
		null,
	);
	const [isRunning, setIsRunning] = useState(false);
	const eventSourceRef = useRef<EventSource | null>(null);
	const [dark, setDark] = useState(false);
	const [selectedStep, setSelectedStep] = useState<WorkflowStep | null>(null);
	const [selectedDiagnostics, setSelectedDiagnostics] = useState<Diagnostic[]>(
		[],
	);

	// Replay state
	const [stateHistory, setStateHistory] = useState<ExecutionState[]>([]);
	const [replayIndex, setReplayIndex] = useState<number | null>(null);

	useEffect(() => {
		document.documentElement.classList.toggle("dark", dark);
	}, [dark]);

	useEffect(() => {
		fetch("/api/workflows")
			.then((r) => r.json())
			.then((list: string[]) => setNames(list));
		fetch("/api/executable")
			.then((r) => r.json())
			.then((list: string[]) => setExecutable(new Set(list)));
	}, []);

	useEffect(() => {
		const name = names[selected];
		if (!name) return;
		setWorkflow(null);
		setExecutionState(null);
		setIsRunning(false);
		setStateHistory([]);
		setReplayIndex(null);
		eventSourceRef.current?.close();
		setSelectedStep(null);
		setSelectedDiagnostics([]);
		fetch(`/api/workflows/${name}`)
			.then((r) => r.json())
			.then((data: WorkflowDefinition) => setWorkflow(data));
	}, [names, selected]);

	const selectedName = names[selected];
	const canExecute = selectedName ? executable.has(selectedName) : false;
	const isDone =
		executionState?.status === "completed" ||
		executionState?.status === "failed";

	const handleRun = useCallback(() => {
		if (!selectedName || isRunning) return;
		setIsRunning(true);
		setExecutionState(null);
		setStateHistory([]);
		setReplayIndex(null);

		const es = new EventSource(`/api/execute/${selectedName}`);
		eventSourceRef.current = es;

		es.addEventListener("state", (e) => {
			const state = JSON.parse(e.data) as ExecutionState;
			setStateHistory((prev) => [...prev, state]);
			// Only update the displayed state if user hasn't scrubbed back
			setReplayIndex((idx) => {
				if (idx === null) {
					setExecutionState(state);
				}
				return idx;
			});
		});

		es.addEventListener("done", () => {
			es.close();
			eventSourceRef.current = null;
			setIsRunning(false);
		});

		es.onerror = () => {
			es.close();
			eventSourceRef.current = null;
			setIsRunning(false);
		};
	}, [selectedName, isRunning]);

	const handleReset = useCallback(() => {
		setExecutionState(null);
		setStateHistory([]);
		setReplayIndex(null);
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

	const showSlider = stateHistory.length > 1;
	const currentIndex = replayIndex ?? stateHistory.length - 1;

	const onStepSelect = useCallback(
		(step: WorkflowStep | null, diagnostics: Diagnostic[]) => {
			setSelectedStep(step);
			setSelectedDiagnostics(diagnostics);
		},
		[],
	);

	if (!names.length) return null;

	return (
		<div className="h-full flex flex-col">
			<header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center gap-4 shrink-0">
				<h1 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
					Workflow Viewer
				</h1>
				<div className="flex gap-1">
					{names.map((name, i) => (
						<button
							type="button"
							key={name}
							onClick={() => setSelected(i)}
							className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
								i === selected
									? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
									: "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
							}`}
						>
							{name}
						</button>
					))}
				</div>
				{canExecute && (
					<div className="flex gap-2">
						{isDone && (
							<button
								type="button"
								onClick={handleReset}
								className="px-3 py-1.5 text-xs rounded-md font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors"
							>
								Reset
							</button>
						)}
						<button
							type="button"
							onClick={handleRun}
							disabled={isRunning}
							className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
								isRunning
									? "bg-blue-200 text-blue-400 cursor-not-allowed dark:bg-blue-900 dark:text-blue-600"
									: "bg-blue-600 text-white hover:bg-blue-700"
							}`}
						>
							{isRunning ? "Running..." : "Run"}
						</button>
					</div>
				)}
				<label className="ml-auto flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer select-none">
					<span>Dark</span>
					<button
						type="button"
						role="switch"
						aria-checked={dark}
						onClick={() => setDark((d) => !d)}
						className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
							dark ? "bg-blue-600" : "bg-gray-300"
						}`}
					>
						<span
							className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
								dark ? "translate-x-[18px]" : "translate-x-[3px]"
							}`}
						/>
					</button>
				</label>
			</header>
			<div className="flex-1 flex flex-col min-h-0">
				<div className="flex-1 flex min-h-0">
					<div className="flex-1">
						{workflow ? (
							<WorkflowViewer
								workflow={workflow}
								executionState={executionState ?? undefined}
								onStepSelect={onStepSelect}
							/>
						) : (
							<div className="flex items-center justify-center h-full text-gray-400 text-sm">
								Loading...
							</div>
						)}
					</div>
					{selectedStep && (
						<StepDetailPanel
							step={selectedStep}
							diagnostics={selectedDiagnostics}
							onClose={() => {
								setSelectedStep(null);
								setSelectedDiagnostics([]);
							}}
						/>
					)}
				</div>
				{showSlider && (
					<div className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center gap-3 shrink-0">
						<input
							type="range"
							min={0}
							max={stateHistory.length - 1}
							value={currentIndex}
							onChange={handleSliderChange}
							className="flex-1 h-1.5 accent-blue-600"
						/>
						<span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums min-w-[60px] text-right">
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
									<button
										type="button"
										onClick={handleLive}
										className={`${base} bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/50 dark:text-blue-400 dark:hover:bg-blue-900 transition-colors`}
									>
										Live
									</button>
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

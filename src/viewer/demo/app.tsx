import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { ExecutionState } from "../../executor/state";
import type { WorkflowDefinition } from "../../types";
import { WorkflowViewer } from "../workflow-viewer";

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
		eventSourceRef.current?.close();
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

		const es = new EventSource(`/api/execute/${selectedName}`);
		eventSourceRef.current = es;

		es.addEventListener("state", (e) => {
			const state = JSON.parse(e.data) as ExecutionState;
			setExecutionState(state);
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
	}, []);

	if (!names.length) return null;

	return (
		<div className="h-full flex flex-col">
			<header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-4 shrink-0">
				<h1 className="text-sm font-semibold text-gray-900">Workflow Viewer</h1>
				<div className="flex gap-1">
					{names.map((name, i) => (
						<button
							type="button"
							key={name}
							onClick={() => setSelected(i)}
							className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
								i === selected
									? "bg-gray-900 text-white"
									: "bg-gray-100 text-gray-600 hover:bg-gray-200"
							}`}
						>
							{name}
						</button>
					))}
				</div>
				{canExecute && (
					<div className="flex gap-2 ml-auto">
						{isDone && (
							<button
								type="button"
								onClick={handleReset}
								className="px-3 py-1.5 text-xs rounded-md font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
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
									? "bg-blue-200 text-blue-400 cursor-not-allowed"
									: "bg-blue-600 text-white hover:bg-blue-700"
							}`}
						>
							{isRunning ? "Running..." : "Run"}
						</button>
					</div>
				)}
			</header>
			<div className="flex-1">
				{workflow ? (
					<WorkflowViewer
						workflow={workflow}
						executionState={executionState ?? undefined}
					/>
				) : (
					<div className="flex items-center justify-center h-full text-gray-400 text-sm">
						Loading...
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

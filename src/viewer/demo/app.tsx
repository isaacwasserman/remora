import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Diagnostic } from "../../compiler/types";
import type { WorkflowDefinition, WorkflowStep } from "../../types";
import { StepDetailPanel } from "../panels/step-detail-panel";
import { ViewerThemeProvider } from "../theme";
import { WorkflowViewer } from "../workflow-viewer";

function App() {
	const [names, setNames] = useState<string[]>([]);
	const [selected, setSelected] = useState(0);
	const [workflow, setWorkflow] = useState<WorkflowDefinition | null>(null);
	const [dark, setDark] = useState(false);
	const [selectedStep, setSelectedStep] = useState<WorkflowStep | null>(null);
	const [selectedDiagnostics, setSelectedDiagnostics] = useState<Diagnostic[]>(
		[],
	);

	useEffect(() => {
		fetch("/api/workflows")
			.then((r) => r.json())
			.then((list: string[]) => setNames(list));
	}, []);

	useEffect(() => {
		const name = names[selected];
		if (!name) return;
		setWorkflow(null);
		setSelectedStep(null);
		setSelectedDiagnostics([]);
		fetch(`/api/workflows/${name}`)
			.then((r) => r.json())
			.then((data: WorkflowDefinition) => setWorkflow(data));
	}, [names, selected]);

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
				<label className="ml-auto flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
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
			<div className="flex-1 flex">
				<div className="flex-1">
					{workflow ? (
						<WorkflowViewer
							workflow={workflow}
							dark={dark}
							onStepSelect={onStepSelect}
						/>
					) : (
						<div className="flex items-center justify-center h-full text-gray-400 text-sm">
							Loading...
						</div>
					)}
				</div>
				{selectedStep && (
					<ViewerThemeProvider value={{ dark }}>
						<StepDetailPanel
							step={selectedStep}
							diagnostics={selectedDiagnostics}
							onClose={() => {
								setSelectedStep(null);
								setSelectedDiagnostics([]);
							}}
						/>
					</ViewerThemeProvider>
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

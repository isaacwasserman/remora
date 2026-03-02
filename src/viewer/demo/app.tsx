import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { WorkflowDefinition } from "../../types";
import { WorkflowViewer } from "../workflow-viewer";

function App() {
	const [names, setNames] = useState<string[]>([]);
	const [selected, setSelected] = useState(0);
	const [workflow, setWorkflow] = useState<WorkflowDefinition | null>(null);

	useEffect(() => {
		fetch("/api/workflows")
			.then((r) => r.json())
			.then((list: string[]) => setNames(list));
	}, []);

	useEffect(() => {
		const name = names[selected];
		if (!name) return;
		setWorkflow(null);
		fetch(`/api/workflows/${name}`)
			.then((r) => r.json())
			.then((data: WorkflowDefinition) => setWorkflow(data));
	}, [names, selected]);

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
			</header>
			<div className="flex-1">
				{workflow ? (
					<WorkflowViewer workflow={workflow} />
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

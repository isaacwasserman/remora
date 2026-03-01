import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { EXAMPLE_TASKS } from "../../example-tasks";
import { WorkflowViewer } from "../workflow-viewer";

const workflows = Object.entries(EXAMPLE_TASKS)
	.filter(([_, task]) => "workflow" in task)
	.map(([name, task]) => ({
		name,
		workflow: (task as { workflow: unknown }).workflow as Parameters<
			typeof WorkflowViewer
		>[0]["workflow"],
	}));

function App() {
	const [selected, setSelected] = useState(0);
	const current = workflows[selected];

	return (
		<div className="h-full flex flex-col">
			<header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-4 shrink-0">
				<h1 className="text-sm font-semibold text-gray-900">
					Workflow Viewer
				</h1>
				<div className="flex gap-1">
					{workflows.map((w, i) => (
						<button
							type="button"
							key={w.name}
							onClick={() => setSelected(i)}
							className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
								i === selected
									? "bg-gray-900 text-white"
									: "bg-gray-100 text-gray-600 hover:bg-gray-200"
							}`}
						>
							{w.name}
						</button>
					))}
				</div>
			</header>
			<div className="flex-1">
				<WorkflowViewer workflow={current.workflow} />
			</div>
		</div>
	);
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);

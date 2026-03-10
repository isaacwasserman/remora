import type React from "react";
import type { Diagnostic } from "../../compiler/types";
import type { WorkflowStep } from "../../types";
import { useViewerTheme } from "../theme";

export interface StepDetailPanelProps {
	step: WorkflowStep;
	diagnostics: Diagnostic[];
	onClose: () => void;
}

function renderExpression(
	expr:
		| { type: "literal"; value: unknown }
		| { type: "jmespath"; expression: string },
): string {
	if (expr.type === "literal") return JSON.stringify(expr.value);
	return expr.expression;
}

function TypeBadge({ type }: { type: string }) {
	const { dark } = useViewerTheme();
	const lightColors: Record<string, string> = {
		"tool-call": "bg-blue-100 text-blue-700",
		"llm-prompt": "bg-violet-100 text-violet-700",
		"extract-data": "bg-purple-100 text-purple-700",
		"switch-case": "bg-amber-100 text-amber-700",
		"for-each": "bg-emerald-100 text-emerald-700",
		start: "bg-green-100 text-green-700",
		end: "bg-gray-100 text-gray-600",
	};
	const darkColors: Record<string, string> = {
		"tool-call": "bg-blue-900/50 text-blue-400",
		"llm-prompt": "bg-violet-900/50 text-violet-400",
		"extract-data": "bg-purple-900/50 text-purple-400",
		"switch-case": "bg-amber-900/50 text-amber-400",
		"for-each": "bg-emerald-900/50 text-emerald-400",
		start: "bg-green-900/50 text-green-400",
		end: "bg-gray-700 text-gray-400",
	};
	const colors = dark ? darkColors : lightColors;
	const fallback = dark
		? "bg-gray-700 text-gray-400"
		: "bg-gray-100 text-gray-600";
	return (
		<span
			className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${colors[type] ?? fallback}`}
		>
			{type}
		</span>
	);
}

function StepParams({ step }: { step: WorkflowStep }) {
	const { dark } = useViewerTheme();
	switch (step.type) {
		case "tool-call":
			return (
				<div className="space-y-2">
					<div>
						<Label>Tool</Label>
						<Code>{step.params.toolName}</Code>
					</div>
					{Object.keys(step.params.toolInput).length > 0 && (
						<div>
							<Label>Inputs</Label>
							<div className="space-y-1">
								{Object.entries(step.params.toolInput).map(([key, val]) => (
									<div key={key} className="flex gap-2 text-xs">
										<span
											className={`font-mono ${dark ? "text-gray-400" : "text-gray-500"}`}
										>
											{key}:
										</span>
										<span
											className={`font-mono ${dark ? "text-gray-300" : "text-gray-700"}`}
										>
											{renderExpression(val)}
										</span>
									</div>
								))}
							</div>
						</div>
					)}
				</div>
			);

		case "llm-prompt":
			return (
				<div className="space-y-2">
					<div>
						<Label>Prompt</Label>
						<pre
							className={`text-xs rounded p-2 whitespace-pre-wrap font-mono ${
								dark ? "text-gray-300 bg-gray-700" : "text-gray-700 bg-gray-50"
							}`}
						>
							{step.params.prompt}
						</pre>
					</div>
					<div>
						<Label>Output Format</Label>
						<Code>{JSON.stringify(step.params.outputFormat, null, 2)}</Code>
					</div>
				</div>
			);

		case "extract-data":
			return (
				<div className="space-y-2">
					<div>
						<Label>Source</Label>
						<Code>{renderExpression(step.params.sourceData)}</Code>
					</div>
					<div>
						<Label>Output Format</Label>
						<Code>{JSON.stringify(step.params.outputFormat, null, 2)}</Code>
					</div>
				</div>
			);

		case "switch-case":
			return (
				<div className="space-y-2">
					<div>
						<Label>Switch On</Label>
						<Code>{renderExpression(step.params.switchOn)}</Code>
					</div>
					<div>
						<Label>Cases</Label>
						<div className="space-y-1">
							{step.params.cases.map((c) => (
								<div key={c.branchBodyStepId} className="text-xs flex gap-2">
									<span
										className={`font-mono ${dark ? "text-gray-400" : "text-gray-500"}`}
									>
										{c.value.type === "default"
											? "default"
											: renderExpression(c.value)}
									</span>
									<span className={dark ? "text-gray-600" : "text-gray-400"}>
										&rarr;
									</span>
									<span
										className={`font-mono ${dark ? "text-gray-300" : "text-gray-700"}`}
									>
										{c.branchBodyStepId}
									</span>
								</div>
							))}
						</div>
					</div>
				</div>
			);

		case "for-each":
			return (
				<div className="space-y-2">
					<div>
						<Label>Target</Label>
						<Code>{renderExpression(step.params.target)}</Code>
					</div>
					<div>
						<Label>Item Variable</Label>
						<Code>{step.params.itemName}</Code>
					</div>
					<div>
						<Label>Loop Body</Label>
						<Code>{step.params.loopBodyStepId}</Code>
					</div>
				</div>
			);

		case "start":
		case "end":
			return null;
	}
}

function Label({ children }: { children: React.ReactNode }) {
	const { dark } = useViewerTheme();
	return (
		<div
			className={`text-[11px] font-medium uppercase tracking-wide mb-0.5 ${
				dark ? "text-gray-500" : "text-gray-400"
			}`}
		>
			{children}
		</div>
	);
}

function Code({ children }: { children: React.ReactNode }) {
	const { dark } = useViewerTheme();
	return (
		<pre
			className={`text-xs rounded p-2 whitespace-pre-wrap font-mono overflow-auto max-h-[200px] ${
				dark ? "text-gray-300 bg-gray-700" : "text-gray-700 bg-gray-50"
			}`}
		>
			{children}
		</pre>
	);
}

export function StepDetailPanel({
	step,
	diagnostics,
	onClose,
}: StepDetailPanelProps) {
	const { dark } = useViewerTheme();
	return (
		<div
			className={`w-[340px] border-l h-full overflow-y-auto shadow-lg ${
				dark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
			}`}
		>
			<div
				className={`sticky top-0 border-b px-4 py-3 flex items-center justify-between ${
					dark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
				}`}
			>
				<div className="flex items-center gap-2">
					<TypeBadge type={step.type} />
					<span
						className={`font-medium text-sm truncate ${dark ? "text-gray-100" : "text-gray-900"}`}
					>
						{step.name}
					</span>
				</div>
				<button
					type="button"
					onClick={onClose}
					className={`text-lg leading-none ${
						dark
							? "text-gray-500 hover:text-gray-300"
							: "text-gray-400 hover:text-gray-600"
					}`}
				>
					&times;
				</button>
			</div>

			<div className="px-4 py-3 space-y-4">
				<div>
					<Label>Step ID</Label>
					<div
						className={`text-xs font-mono ${dark ? "text-gray-400" : "text-gray-600"}`}
					>
						{step.id}
					</div>
				</div>

				<div>
					<Label>Description</Label>
					<div
						className={`text-xs ${dark ? "text-gray-400" : "text-gray-600"}`}
					>
						{step.description}
					</div>
				</div>

				{step.nextStepId && (
					<div>
						<Label>Next Step</Label>
						<div
							className={`text-xs font-mono ${dark ? "text-gray-400" : "text-gray-600"}`}
						>
							{step.nextStepId}
						</div>
					</div>
				)}

				<div
					className={`border-t pt-3 ${dark ? "border-gray-700" : "border-gray-100"}`}
				>
					<Label>Parameters</Label>
					<div className="mt-1">
						<StepParams step={step} />
					</div>
				</div>

				{diagnostics.length > 0 && (
					<div
						className={`border-t pt-3 ${dark ? "border-gray-700" : "border-gray-100"}`}
					>
						<Label>Diagnostics</Label>
						<div className="space-y-2 mt-1">
							{diagnostics.map((d) => (
								<div
									key={`${d.code}-${d.message}`}
									className={`text-xs p-2 rounded ${
										d.severity === "error"
											? dark
												? "bg-red-900/30 text-red-400 border border-red-800"
												: "bg-red-50 text-red-700 border border-red-200"
											: dark
												? "bg-amber-900/30 text-amber-400 border border-amber-800"
												: "bg-amber-50 text-amber-700 border border-amber-200"
									}`}
								>
									<div className="font-medium font-mono">{d.code}</div>
									<div className="mt-0.5">{d.message}</div>
								</div>
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

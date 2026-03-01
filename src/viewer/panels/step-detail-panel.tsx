import React from "react";
import type { Diagnostic } from "../../compiler/types";
import type { WorkflowStep } from "../../types";

interface StepDetailPanelProps {
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
	const colors: Record<string, string> = {
		"tool-call": "bg-blue-100 text-blue-700",
		"llm-prompt": "bg-violet-100 text-violet-700",
		"extract-data": "bg-purple-100 text-purple-700",
		"switch-case": "bg-amber-100 text-amber-700",
		"for-each": "bg-emerald-100 text-emerald-700",
		end: "bg-gray-100 text-gray-600",
	};
	return (
		<span
			className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${colors[type] ?? "bg-gray-100 text-gray-600"}`}
		>
			{type}
		</span>
	);
}

function StepParams({ step }: { step: WorkflowStep }) {
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
								{Object.entries(step.params.toolInput).map(
									([key, val]) => (
										<div key={key} className="flex gap-2 text-xs">
											<span className="font-mono text-gray-500">
												{key}:
											</span>
											<span className="font-mono text-gray-700">
												{renderExpression(val)}
											</span>
										</div>
									),
								)}
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
						<pre className="text-xs text-gray-700 bg-gray-50 rounded p-2 whitespace-pre-wrap font-mono">
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
							{step.params.cases.map((c, i) => (
								<div key={i} className="text-xs flex gap-2">
									<span className="font-mono text-gray-500">
										{c.value.type === "default"
											? "default"
											: renderExpression(c.value)}
									</span>
									<span className="text-gray-400">&rarr;</span>
									<span className="font-mono text-gray-700">
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

		case "end":
			return null;
	}
}

function Label({ children }: { children: React.ReactNode }) {
	return (
		<div className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-0.5">
			{children}
		</div>
	);
}

function Code({ children }: { children: React.ReactNode }) {
	return (
		<pre className="text-xs text-gray-700 bg-gray-50 rounded p-2 whitespace-pre-wrap font-mono overflow-auto max-h-[200px]">
			{children}
		</pre>
	);
}

export function StepDetailPanel({
	step,
	diagnostics,
	onClose,
}: StepDetailPanelProps) {
	return (
		<div className="w-[340px] bg-white border-l border-gray-200 h-full overflow-y-auto shadow-lg">
			<div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
				<div className="flex items-center gap-2">
					<TypeBadge type={step.type} />
					<span className="font-medium text-sm text-gray-900 truncate">
						{step.name}
					</span>
				</div>
				<button
					type="button"
					onClick={onClose}
					className="text-gray-400 hover:text-gray-600 text-lg leading-none"
				>
					&times;
				</button>
			</div>

			<div className="px-4 py-3 space-y-4">
				<div>
					<Label>Step ID</Label>
					<div className="text-xs font-mono text-gray-600">{step.id}</div>
				</div>

				<div>
					<Label>Description</Label>
					<div className="text-xs text-gray-600">{step.description}</div>
				</div>

				{step.nextStepId && (
					<div>
						<Label>Next Step</Label>
						<div className="text-xs font-mono text-gray-600">
							{step.nextStepId}
						</div>
					</div>
				)}

				<div className="border-t border-gray-100 pt-3">
					<Label>Parameters</Label>
					<div className="mt-1">
						<StepParams step={step} />
					</div>
				</div>

				{diagnostics.length > 0 && (
					<div className="border-t border-gray-100 pt-3">
						<Label>Diagnostics</Label>
						<div className="space-y-2 mt-1">
							{diagnostics.map((d, i) => (
								<div
									key={i}
									className={`text-xs p-2 rounded ${
										d.severity === "error"
											? "bg-red-50 text-red-700 border border-red-200"
											: "bg-amber-50 text-amber-700 border border-amber-200"
									}`}
								>
									<div className="font-medium font-mono">
										{d.code}
									</div>
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

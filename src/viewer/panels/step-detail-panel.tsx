import type React from "react";
import type { Diagnostic } from "../../compiler/types";
import type {
	ExecutionPathSegment,
	StepExecutionRecord,
} from "../../executor/state";
import type { WorkflowStep } from "../../types";
import type { StepExecutionSummary } from "../execution-state";

export interface StepDetailPanelProps {
	step: WorkflowStep;
	diagnostics: Diagnostic[];
	executionSummary?: StepExecutionSummary;
	executionRecords?: StepExecutionRecord[];
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
		"tool-call":
			"bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400",
		"llm-prompt":
			"bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-400",
		"extract-data":
			"bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-400",
		"switch-case":
			"bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400",
		"for-each":
			"bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400",
		"agent-loop":
			"bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-400",
		sleep:
			"bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-400",
		"wait-for-condition":
			"bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-400",
		start:
			"bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400",
		end: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
	};
	const fallback =
		"bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400";
	return (
		<span
			className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${colors[type] ?? fallback}`}
		>
			{type}
		</span>
	);
}

function StatusBadge({ summary }: { summary: StepExecutionSummary }) {
	const colors: Record<string, string> = {
		pending: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
		running: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400",
		completed:
			"bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400",
		failed: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400",
		skipped: "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400",
	};
	return (
		<span
			className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${colors[summary.status]}`}
		>
			{summary.status}
		</span>
	);
}

function ResolvedCode({
	value,
	expression,
}: {
	value: unknown;
	expression?: string;
}) {
	const display =
		typeof value === "string" ? value : JSON.stringify(value, null, 2);
	return (
		<pre
			className="text-xs text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/50 rounded p-2 whitespace-pre-wrap font-mono overflow-auto max-h-[200px] cursor-default"
			title={expression}
		>
			{display}
		</pre>
	);
}

function StepParams({
	step,
	resolvedInputs,
}: {
	step: WorkflowStep;
	resolvedInputs?: unknown;
}) {
	const resolved = resolvedInputs as Record<string, unknown> | undefined;

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
								{Object.entries(step.params.toolInput).map(([key, val]) => {
									const resolvedVal = resolved?.[key];
									const hasResolved = resolvedVal !== undefined;
									return (
										<div key={key} className="flex gap-2 text-xs">
											<span className="font-mono text-gray-500 dark:text-gray-400">
												{key}:
											</span>
											<span
												className={`font-mono ${hasResolved ? "text-emerald-700 dark:text-emerald-400" : "text-gray-700 dark:text-gray-300"}`}
												title={hasResolved ? renderExpression(val) : undefined}
											>
												{hasResolved
													? typeof resolvedVal === "string"
														? resolvedVal
														: JSON.stringify(resolvedVal)
													: renderExpression(val)}
											</span>
										</div>
									);
								})}
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
						{resolved?.prompt ? (
							<ResolvedCode
								value={resolved.prompt}
								expression={step.params.prompt}
							/>
						) : (
							<pre className="text-xs rounded p-2 whitespace-pre-wrap font-mono text-gray-700 bg-gray-50 dark:text-gray-300 dark:bg-gray-700">
								{step.params.prompt}
							</pre>
						)}
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
						{resolved?.sourceData !== undefined ? (
							<ResolvedCode
								value={resolved.sourceData}
								expression={renderExpression(step.params.sourceData)}
							/>
						) : (
							<Code>{renderExpression(step.params.sourceData)}</Code>
						)}
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
						{resolved?.switchOn !== undefined ? (
							<ResolvedCode
								value={resolved.switchOn}
								expression={renderExpression(step.params.switchOn)}
							/>
						) : (
							<Code>{renderExpression(step.params.switchOn)}</Code>
						)}
					</div>
					<div>
						<Label>Cases</Label>
						<div className="space-y-1">
							{step.params.cases.map((c) => (
								<div key={c.branchBodyStepId} className="text-xs flex gap-2">
									<span className="font-mono text-gray-500 dark:text-gray-400">
										{c.value.type === "default"
											? "default"
											: renderExpression(c.value)}
									</span>
									<span className="text-gray-400 dark:text-gray-600">
										&rarr;
									</span>
									<span className="font-mono text-gray-700 dark:text-gray-300">
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
						{resolved?.target !== undefined ? (
							<ResolvedCode
								value={resolved.target}
								expression={renderExpression(step.params.target)}
							/>
						) : (
							<Code>{renderExpression(step.params.target)}</Code>
						)}
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

		case "sleep":
			return (
				<div className="space-y-2">
					<div>
						<Label>Duration</Label>
						{resolved?.durationMs !== undefined ? (
							<ResolvedCode
								value={`${resolved.durationMs}ms`}
								expression={renderExpression(step.params.durationMs)}
							/>
						) : (
							<Code>{renderExpression(step.params.durationMs)}ms</Code>
						)}
					</div>
				</div>
			);

		case "wait-for-condition":
			return (
				<div className="space-y-2">
					<div>
						<Label>Condition</Label>
						{resolved?.condition !== undefined ? (
							<ResolvedCode
								value={resolved.condition}
								expression={renderExpression(step.params.condition)}
							/>
						) : (
							<Code>{renderExpression(step.params.condition)}</Code>
						)}
					</div>
					<div>
						<Label>Condition Step</Label>
						<Code>{step.params.conditionStepId}</Code>
					</div>
					{step.params.maxAttempts && (
						<div>
							<Label>Max Attempts</Label>
							<Code>{renderExpression(step.params.maxAttempts)}</Code>
						</div>
					)}
					{step.params.intervalMs && (
						<div>
							<Label>Interval</Label>
							<Code>{renderExpression(step.params.intervalMs)}ms</Code>
						</div>
					)}
					{step.params.timeoutMs && (
						<div>
							<Label>Timeout</Label>
							<Code>{renderExpression(step.params.timeoutMs)}ms</Code>
						</div>
					)}
				</div>
			);

		case "agent-loop":
			return (
				<div className="space-y-2">
					<div>
						<Label>Instructions</Label>
						<pre className="text-xs rounded p-2 whitespace-pre-wrap font-mono text-gray-700 bg-gray-50 dark:text-gray-300 dark:bg-gray-700">
							{step.params.instructions}
						</pre>
					</div>
					{step.params.tools.length > 0 && (
						<div>
							<Label>Tools</Label>
							<Code>{step.params.tools.join(", ")}</Code>
						</div>
					)}
					<div>
						<Label>Output Format</Label>
						<Code>{JSON.stringify(step.params.outputFormat, null, 2)}</Code>
					</div>
					{step.params.maxSteps && (
						<div>
							<Label>Max Steps</Label>
							<Code>{renderExpression(step.params.maxSteps)}</Code>
						</div>
					)}
				</div>
			);

		case "start":
			return null;

		case "end":
			if (step.params?.output) {
				return (
					<div className="space-y-2">
						<div>
							<Label>Output</Label>
							{resolved?.output !== undefined ? (
								<ResolvedCode
									value={resolved.output}
									expression={renderExpression(step.params.output)}
								/>
							) : (
								<Code>{renderExpression(step.params.output)}</Code>
							)}
						</div>
					</div>
				);
			}
			return null;
	}
}

function Label({ children }: { children: React.ReactNode }) {
	return (
		<div className="text-[11px] font-medium uppercase tracking-wide mb-0.5 text-gray-400 dark:text-gray-500">
			{children}
		</div>
	);
}

function Code({ children }: { children: React.ReactNode }) {
	return (
		<pre className="text-xs rounded p-2 whitespace-pre-wrap font-mono overflow-auto max-h-[200px] text-gray-700 bg-gray-50 dark:text-gray-300 dark:bg-gray-700">
			{children}
		</pre>
	);
}

function formatPathSegment(seg: ExecutionPathSegment): string {
	switch (seg.type) {
		case "for-each":
			return `Iteration ${seg.iterationIndex}: ${formatValue(seg.itemValue)}`;
		case "switch-case":
			return `Case ${seg.matchedCaseIndex}: ${formatValue(seg.matchedValue)}`;
		case "wait-for-condition":
			return `Poll attempt ${seg.pollAttempt}`;
	}
}

function formatValue(value: unknown): string {
	if (typeof value === "string") return value;
	return JSON.stringify(value);
}

const recordStatusColors: Record<string, string> = {
	pending: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
	running: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400",
	completed:
		"bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400",
	failed: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400",
	skipped: "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400",
};

function ExecutionRecordCard({ record }: { record: StepExecutionRecord }) {
	const pathLabel =
		record.path.length > 0
			? record.path.map(formatPathSegment).join(" > ")
			: null;

	return (
		<div className="border border-gray-200 dark:border-gray-700 rounded-md p-2 space-y-1.5">
			{pathLabel && (
				<div className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
					{pathLabel}
				</div>
			)}
			<div className="flex items-center gap-2">
				<span
					className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${recordStatusColors[record.status]}`}
				>
					{record.status}
				</span>
				{record.durationMs !== undefined && (
					<span className="text-[11px] text-gray-400 dark:text-gray-500">
						{record.durationMs}ms
					</span>
				)}
				{record.retries.length > 0 && (
					<span className="text-[11px] text-amber-600 dark:text-amber-400">
						{record.retries.length}{" "}
						{record.retries.length === 1 ? "retry" : "retries"}
					</span>
				)}
			</div>
			{record.resolvedInputs !== undefined && (
				<details className="text-xs">
					<summary className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide cursor-pointer select-none">
						Resolved Inputs
					</summary>
					<ResolvedCode value={record.resolvedInputs} />
				</details>
			)}
			{record.output !== undefined && (
				<details className="text-xs">
					<summary className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide cursor-pointer select-none">
						Output
					</summary>
					<Code>
						{typeof record.output === "string"
							? record.output
							: JSON.stringify(record.output, null, 2)}
					</Code>
				</details>
			)}
			{record.error && (
				<div className="text-xs p-2 rounded bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800">
					<div className="font-medium font-mono">{record.error.code}</div>
					<div className="mt-0.5">{record.error.message}</div>
				</div>
			)}
		</div>
	);
}

export function StepDetailPanel({
	step,
	diagnostics,
	executionSummary,
	executionRecords,
	onClose,
}: StepDetailPanelProps) {
	return (
		<div className="w-[340px] border-l h-full min-h-0 overflow-y-auto shadow-lg bg-white border-gray-200 dark:bg-gray-800 dark:border-gray-700">
			<div className="sticky top-0 border-b px-4 py-3 flex items-center justify-between bg-white border-gray-200 dark:bg-gray-800 dark:border-gray-700">
				<div className="flex items-center gap-2">
					<TypeBadge type={step.type} />
					<span className="font-medium text-sm truncate text-gray-900 dark:text-gray-100">
						{step.name}
					</span>
				</div>
				<button
					type="button"
					onClick={onClose}
					className="text-lg leading-none text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
				>
					&times;
				</button>
			</div>

			<div className="px-4 py-3 space-y-4">
				<div>
					<Label>Step ID</Label>
					<div className="text-xs font-mono text-gray-600 dark:text-gray-400">
						{step.id}
					</div>
				</div>

				<div>
					<Label>Description</Label>
					<div className="text-xs text-gray-600 dark:text-gray-400">
						{step.description}
					</div>
				</div>

				{step.nextStepId && (
					<div>
						<Label>Next Step</Label>
						<div className="text-xs font-mono text-gray-600 dark:text-gray-400">
							{step.nextStepId}
						</div>
					</div>
				)}

				<div className="border-t pt-3 border-gray-100 dark:border-gray-700">
					<Label>Parameters</Label>
					<div className="mt-1">
						<StepParams
							step={step}
							resolvedInputs={
								executionRecords?.length
									? executionRecords[executionRecords.length - 1]
											?.resolvedInputs
									: undefined
							}
						/>
					</div>
				</div>

				{executionSummary && (
					<div className="border-t border-gray-100 dark:border-gray-700 pt-3">
						<Label>Execution</Label>
						<div className="mt-1 space-y-2">
							<div className="flex items-center gap-2">
								<StatusBadge summary={executionSummary} />
								{executionSummary.latestDurationMs !== undefined && (
									<span className="text-[11px] text-gray-400 dark:text-gray-500">
										{executionSummary.latestDurationMs}ms
									</span>
								)}
								{executionSummary.executionCount > 1 && (
									<span className="text-[11px] text-gray-400 dark:text-gray-500">
										({executionSummary.completedCount}/
										{executionSummary.executionCount} iterations)
									</span>
								)}
							</div>

							{executionSummary.latestOutput !== undefined && (
								<div>
									<Label>Output</Label>
									<Code>
										{typeof executionSummary.latestOutput === "string"
											? executionSummary.latestOutput
											: JSON.stringify(executionSummary.latestOutput, null, 2)}
									</Code>
								</div>
							)}

							{executionSummary.latestError && (
								<div className="text-xs p-2 rounded bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800">
									<div className="font-medium font-mono">
										{executionSummary.latestError.code}
									</div>
									<div className="mt-0.5">
										{executionSummary.latestError.message}
									</div>
								</div>
							)}

							{executionSummary.totalRetries > 0 && (
								<div className="text-[11px] text-amber-600 dark:text-amber-400">
									{executionSummary.totalRetries}{" "}
									{executionSummary.totalRetries === 1 ? "retry" : "retries"}{" "}
									attempted
								</div>
							)}
						</div>
					</div>
				)}

				{executionRecords && executionRecords.length > 0 && (
					<div className="border-t border-gray-100 dark:border-gray-700 pt-3">
						<Label>Execution History</Label>
						<div className="space-y-2 mt-1">
							{executionRecords.map((record, i) => (
								<ExecutionRecordCard
									key={`${record.stepId}-${i}`}
									record={record}
								/>
							))}
						</div>
					</div>
				)}

				{diagnostics.length > 0 && (
					<div className="border-t pt-3 border-gray-100 dark:border-gray-700">
						<Label>Diagnostics</Label>
						<div className="space-y-2 mt-1">
							{diagnostics.map((d) => (
								<div
									key={`${d.code}-${d.message}`}
									className={`text-xs p-2 rounded ${
										d.severity === "error"
											? "bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"
											: "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800"
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

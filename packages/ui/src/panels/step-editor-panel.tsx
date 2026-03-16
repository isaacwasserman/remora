import type {
	Diagnostic,
	ToolDefinitionMap,
	WorkflowStep,
} from "@remoraflow/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { ExpressionEditor } from "../editors/expression-editor";
import { JsonCodeEditor } from "../editors/json-code-editor";
import { cn } from "../lib/utils";
import { Label, TypeBadge } from "./shared";

type Expression =
	| { type: "literal"; value: unknown }
	| { type: "jmespath"; expression: string }
	| { type: "template"; template: string };

export interface StepEditorPanelProps {
	step: WorkflowStep;
	availableToolNames: string[];
	allStepIds: string[];
	toolSchemas?: ToolDefinitionMap;
	diagnostics?: Diagnostic[];
	workflowInputSchema?: object;
	workflowOutputSchema?: object;
	onChange: (updates: Record<string, unknown>) => void;
	onWorkflowMetaChange?: (updates: Record<string, unknown>) => void;
	onDelete: () => void;
	onClose: () => void;
}

const ID_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]+$/;

function StepIdInput({
	value,
	onChange,
}: {
	value: string;
	onChange: (id: string) => void;
}) {
	const [draft, setDraft] = useState(value);
	const [error, setError] = useState("");

	useEffect(() => {
		setDraft(value);
		setError("");
	}, [value]);

	const handleBlur = useCallback(() => {
		if (!draft || !ID_REGEX.test(draft)) {
			setError(
				"Must start with letter/underscore, contain only letters, digits, underscores (min 2 chars)",
			);
			return;
		}
		setError("");
		if (draft !== value) {
			onChange(draft);
		}
	}, [draft, value, onChange]);

	return (
		<div>
			<Label>Step ID</Label>
			<Input
				value={draft}
				onChange={(e) => setDraft(e.target.value)}
				onBlur={handleBlur}
				className={cn(
					"h-8 text-xs font-mono",
					error && "border-red-500 focus-visible:ring-red-500/50",
				)}
				placeholder="step_id"
			/>
			{error && <div className="text-[10px] text-red-500 mt-0.5">{error}</div>}
		</div>
	);
}

function StepIdDropdown({
	label,
	value,
	onChange,
	stepIds,
	allowEmpty,
}: {
	label: string;
	value: string;
	onChange: (id: string) => void;
	stepIds: string[];
	allowEmpty?: boolean;
}) {
	return (
		<div>
			<Label>{label}</Label>
			<Select
				value={value || "__empty__"}
				onValueChange={(val) => onChange(val === "__empty__" ? "" : val)}
			>
				<SelectTrigger className="h-8 text-xs font-mono w-full">
					<SelectValue placeholder="— none —" />
				</SelectTrigger>
				<SelectContent>
					{(allowEmpty || !value) && (
						<SelectItem value="__empty__">— none —</SelectItem>
					)}
					{stepIds.map((id) => (
						<SelectItem key={id} value={id}>
							{id}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

function JsonEditor({
	label,
	value,
	onChange,
}: {
	label: string;
	value: object;
	onChange: (value: object) => void;
}) {
	const [draft, setDraft] = useState(JSON.stringify(value, null, 2));

	useEffect(() => {
		setDraft(JSON.stringify(value, null, 2));
	}, [value]);

	const handleBlur = useCallback(() => {
		try {
			const parsed = JSON.parse(draft);
			onChange(parsed);
		} catch {
			// Validation errors shown inline by CodeMirror linter
		}
	}, [draft, onChange]);

	return (
		<div>
			<Label>{label}</Label>
			<JsonCodeEditor value={draft} onChange={setDraft} onBlur={handleBlur} />
		</div>
	);
}

function ToolCallParams({
	step,
	onChange,
	availableToolNames,
	toolSchemas,
}: {
	step: WorkflowStep & { type: "tool-call" };
	onChange: StepEditorPanelProps["onChange"];
	availableToolNames: string[];
	toolSchemas?: ToolDefinitionMap;
}) {
	const schema = toolSchemas?.[step.params.toolName];
	const schemaKeys = schema?.inputSchema.properties
		? Object.keys(schema.inputSchema.properties)
		: null;
	const requiredKeys = new Set(schema?.inputSchema.required ?? []);

	// When tool name changes, auto-populate missing schema params
	const prevToolNameRef = useRef(step.params.toolName);
	useEffect(() => {
		if (step.params.toolName === prevToolNameRef.current) return;
		prevToolNameRef.current = step.params.toolName;

		const newSchema = toolSchemas?.[step.params.toolName];
		if (!newSchema?.inputSchema.properties) return;

		const newInput: Record<string, Expression> = {};
		for (const key of Object.keys(newSchema.inputSchema.properties)) {
			newInput[key] = (step.params.toolInput[key] as Expression) ?? {
				type: "literal",
				value: "",
			};
		}
		onChange({ params: { ...step.params, toolInput: newInput } });
	}, [
		step.params.toolName,
		step.params.toolInput,
		toolSchemas,
		onChange,
		step.params,
	]);

	// All keys to render: schema keys (if available) or existing keys
	const displayKeys = schemaKeys ?? Object.keys(step.params.toolInput);

	return (
		<div className="space-y-3">
			<div>
				<Label>Tool Name</Label>
				{availableToolNames.length > 0 ? (
					<Select
						value={step.params.toolName}
						onValueChange={(val) =>
							onChange({
								params: { ...step.params, toolName: val },
							})
						}
					>
						<SelectTrigger className="h-8 text-xs font-mono w-full">
							<SelectValue placeholder="-- select tool --" />
						</SelectTrigger>
						<SelectContent>
							{availableToolNames.map((name) => (
								<SelectItem key={name} value={name}>
									{name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				) : (
					<Input
						value={step.params.toolName}
						onChange={(e) =>
							onChange({
								params: { ...step.params, toolName: e.target.value },
							})
						}
						className="h-8 text-xs font-mono"
						placeholder="tool-name"
					/>
				)}
			</div>
			{schema?.description && (
				<p className="text-[11px] text-muted-foreground leading-snug">
					{schema.description}
				</p>
			)}
			{displayKeys.length > 0 && (
				<div>
					<Label>Tool Inputs</Label>
					<div className="space-y-2">
						{displayKeys.map((key) => {
							const expr = step.params.toolInput[key] as Expression | undefined;
							const isRequired = requiredKeys.has(key);
							const propSchema = schema?.inputSchema.properties?.[key] as
								| { description?: string; type?: string; enum?: string[] }
								| undefined;
							return (
								<div key={key} className="border border-border rounded p-2">
									<div className="flex items-center gap-1.5 mb-1">
										<span className="text-xs font-mono text-muted-foreground">
											{key}
										</span>
										{isRequired && (
											<span className="text-[10px] font-medium text-red-500">
												required
											</span>
										)}
									</div>
									{propSchema?.description && (
										<p className="text-[10px] text-muted-foreground mb-1 leading-snug">
											{propSchema.description}
										</p>
									)}
									<ExpressionEditor
										value={expr ?? { type: "literal" as const, value: "" }}
										onChange={(val) =>
											onChange({
												params: {
													...step.params,
													toolInput: {
														...step.params.toolInput,
														[key]: val,
													},
												},
											})
										}
									/>
								</div>
							);
						})}
					</div>
				</div>
			)}
		</div>
	);
}

function LlmPromptParams({
	step,
	onChange,
}: {
	step: WorkflowStep & { type: "llm-prompt" };
	onChange: StepEditorPanelProps["onChange"];
}) {
	return (
		<div className="space-y-3">
			<div>
				<Label>Prompt</Label>
				<Textarea
					value={step.params.prompt}
					onChange={(e) =>
						onChange({
							params: { ...step.params, prompt: e.target.value },
						})
					}
					rows={4}
					className="text-xs font-mono resize-y"
					placeholder="Write your prompt here. Use ${stepId.field} for interpolation."
				/>
			</div>
			<JsonEditor
				label="Output Format (JSON Schema)"
				value={step.params.outputFormat}
				onChange={(val) =>
					onChange({ params: { ...step.params, outputFormat: val } })
				}
			/>
		</div>
	);
}

function ExtractDataParams({
	step,
	onChange,
}: {
	step: WorkflowStep & { type: "extract-data" };
	onChange: StepEditorPanelProps["onChange"];
}) {
	return (
		<div className="space-y-3">
			<ExpressionEditor
				label="Source Data"
				value={step.params.sourceData as Expression}
				onChange={(val) =>
					onChange({ params: { ...step.params, sourceData: val } })
				}
			/>
			<JsonEditor
				label="Output Format (JSON Schema)"
				value={step.params.outputFormat}
				onChange={(val) =>
					onChange({ params: { ...step.params, outputFormat: val } })
				}
			/>
		</div>
	);
}

function SwitchCaseParams({
	step,
	onChange,
	allStepIds,
}: {
	step: WorkflowStep & { type: "switch-case" };
	onChange: StepEditorPanelProps["onChange"];
	allStepIds: string[];
}) {
	return (
		<div className="space-y-3">
			<ExpressionEditor
				label="Switch On"
				value={step.params.switchOn as Expression}
				onChange={(val) =>
					onChange({ params: { ...step.params, switchOn: val } })
				}
			/>
			<div>
				<Label>Cases</Label>
				<div className="space-y-2">
					{step.params.cases.map((c, i) => (
						<div
							key={`case-${c.branchBodyStepId || "empty"}-${i}`}
							className="border border-border rounded p-2 space-y-2"
						>
							<div className="flex items-center justify-between">
								<span className="text-xs font-medium text-muted-foreground">
									Case {i + 1}
								</span>
								<Button
									variant="ghost"
									size="xs"
									className="text-red-500 hover:text-red-700"
									onClick={() => {
										const cases = step.params.cases.filter((_, j) => j !== i);
										onChange({
											params: { ...step.params, cases },
										});
									}}
								>
									remove
								</Button>
							</div>
							{c.value.type === "default" ? (
								<div className="text-xs text-muted-foreground italic">
									default case
								</div>
							) : (
								<ExpressionEditor
									label="Value"
									value={c.value as Expression}
									onChange={(val) => {
										const cases = [...step.params.cases];
										cases[i] = { ...c, value: val as typeof c.value };
										onChange({
											params: { ...step.params, cases },
										});
									}}
								/>
							)}
							<StepIdDropdown
								label="Branch Body Step"
								value={c.branchBodyStepId}
								onChange={(id) => {
									const cases = [...step.params.cases];
									cases[i] = {
										...c,
										branchBodyStepId: id,
									};
									onChange({
										params: { ...step.params, cases },
									});
								}}
								stepIds={allStepIds}
								allowEmpty
							/>
						</div>
					))}
					<div className="flex gap-1">
						<Button
							variant="secondary"
							size="sm"
							onClick={() => {
								const cases = [
									...step.params.cases,
									{
										value: {
											type: "literal" as const,
											value: "",
										},
										branchBodyStepId: "",
									},
								];
								onChange({
									params: { ...step.params, cases },
								});
							}}
						>
							Add Case
						</Button>
						<Button
							variant="secondary"
							size="sm"
							onClick={() => {
								const hasDefault = step.params.cases.some(
									(c) => c.value.type === "default",
								);
								if (hasDefault) return;
								const cases = [
									...step.params.cases,
									{
										value: { type: "default" as const },
										branchBodyStepId: "",
									},
								];
								onChange({
									params: { ...step.params, cases },
								});
							}}
						>
							Add Default
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}

function ForEachParams({
	step,
	onChange,
	allStepIds,
}: {
	step: WorkflowStep & { type: "for-each" };
	onChange: StepEditorPanelProps["onChange"];
	allStepIds: string[];
}) {
	return (
		<div className="space-y-3">
			<ExpressionEditor
				label="Target Array"
				value={step.params.target as Expression}
				onChange={(val) =>
					onChange({ params: { ...step.params, target: val } })
				}
			/>
			<div>
				<Label>Item Variable Name</Label>
				<Input
					value={step.params.itemName}
					onChange={(e) =>
						onChange({
							params: { ...step.params, itemName: e.target.value },
						})
					}
					className="h-8 text-xs font-mono"
					placeholder="item"
				/>
			</div>
			<StepIdDropdown
				label="Loop Body Step"
				value={step.params.loopBodyStepId}
				onChange={(id) =>
					onChange({
						params: {
							...step.params,
							loopBodyStepId: id,
						},
					})
				}
				stepIds={allStepIds}
				allowEmpty
			/>
		</div>
	);
}

function SleepParams({
	step,
	onChange,
}: {
	step: WorkflowStep & { type: "sleep" };
	onChange: StepEditorPanelProps["onChange"];
}) {
	return (
		<ExpressionEditor
			label="Duration (ms)"
			value={step.params.durationMs as Expression}
			onChange={(val) =>
				onChange({ params: { ...step.params, durationMs: val } })
			}
		/>
	);
}

function WaitForConditionParams({
	step,
	onChange,
	allStepIds,
}: {
	step: WorkflowStep & { type: "wait-for-condition" };
	onChange: StepEditorPanelProps["onChange"];
	allStepIds: string[];
}) {
	return (
		<div className="space-y-3">
			<StepIdDropdown
				label="Condition Step"
				value={step.params.conditionStepId}
				onChange={(id) =>
					onChange({
						params: {
							...step.params,
							conditionStepId: id,
						},
					})
				}
				stepIds={allStepIds}
				allowEmpty
			/>
			<ExpressionEditor
				label="Condition"
				value={step.params.condition as Expression}
				onChange={(val) =>
					onChange({ params: { ...step.params, condition: val } })
				}
			/>
			{step.params.maxAttempts && (
				<ExpressionEditor
					label="Max Attempts"
					value={step.params.maxAttempts as Expression}
					onChange={(val) =>
						onChange({
							params: { ...step.params, maxAttempts: val },
						})
					}
				/>
			)}
			{step.params.intervalMs && (
				<ExpressionEditor
					label="Interval (ms)"
					value={step.params.intervalMs as Expression}
					onChange={(val) =>
						onChange({
							params: { ...step.params, intervalMs: val },
						})
					}
				/>
			)}
		</div>
	);
}

function AgentLoopParams({
	step,
	onChange,
	availableToolNames,
}: {
	step: WorkflowStep & { type: "agent-loop" };
	onChange: StepEditorPanelProps["onChange"];
	availableToolNames: string[];
}) {
	return (
		<div className="space-y-3">
			<div>
				<Label>Instructions</Label>
				<Textarea
					value={step.params.instructions}
					onChange={(e) =>
						onChange({
							params: {
								...step.params,
								instructions: e.target.value,
							},
						})
					}
					rows={4}
					className="text-xs font-mono resize-y"
					placeholder="Write agent instructions. Use ${stepId.field} for interpolation."
				/>
			</div>
			<div>
				<Label>Tools</Label>
				{availableToolNames.length > 0 ? (
					<div className="space-y-1">
						{availableToolNames.map((name) => (
							<label
								key={name}
								className="flex items-center gap-2 text-xs text-foreground cursor-pointer"
							>
								<input
									type="checkbox"
									checked={step.params.tools.includes(name)}
									onChange={(e) => {
										const tools = e.target.checked
											? [...step.params.tools, name]
											: step.params.tools.filter((t) => t !== name);
										onChange({
											params: { ...step.params, tools },
										});
									}}
									className="rounded"
								/>
								{name}
							</label>
						))}
					</div>
				) : (
					<Input
						value={step.params.tools.join(", ")}
						onChange={(e) =>
							onChange({
								params: {
									...step.params,
									tools: e.target.value
										.split(",")
										.map((t) => t.trim())
										.filter(Boolean),
								},
							})
						}
						className="h-8 text-xs font-mono"
						placeholder="tool1, tool2"
					/>
				)}
			</div>
			<JsonEditor
				label="Output Format (JSON Schema)"
				value={step.params.outputFormat}
				onChange={(val) =>
					onChange({ params: { ...step.params, outputFormat: val } })
				}
			/>
		</div>
	);
}

function StartParams({
	workflowInputSchema,
	onWorkflowMetaChange,
}: {
	workflowInputSchema?: object;
	onWorkflowMetaChange?: StepEditorPanelProps["onWorkflowMetaChange"];
}) {
	const hasSchema = !!workflowInputSchema;
	return (
		<div className="space-y-3">
			<label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
				<input
					type="checkbox"
					checked={hasSchema}
					onChange={(e) => {
						if (e.target.checked) {
							onWorkflowMetaChange?.({
								inputSchema: {
									type: "object",
									properties: {},
								},
							});
						} else {
							onWorkflowMetaChange?.({
								inputSchema: undefined,
							});
						}
					}}
					className="rounded"
				/>
				Workflow has input schema
			</label>
			{hasSchema && workflowInputSchema && (
				<JsonEditor
					label="Input Schema (JSON Schema)"
					value={workflowInputSchema}
					onChange={(val) => onWorkflowMetaChange?.({ inputSchema: val })}
				/>
			)}
		</div>
	);
}

function EndParams({
	step,
	onChange,
	workflowOutputSchema,
	onWorkflowMetaChange,
}: {
	step: WorkflowStep & { type: "end" };
	onChange: StepEditorPanelProps["onChange"];
	workflowOutputSchema?: object;
	onWorkflowMetaChange?: StepEditorPanelProps["onWorkflowMetaChange"];
}) {
	const hasOutput = !!step.params?.output;
	const hasSchema = !!workflowOutputSchema;
	return (
		<div className="space-y-3">
			<label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
				<input
					type="checkbox"
					checked={hasOutput}
					onChange={(e) => {
						if (e.target.checked) {
							onChange({
								params: {
									output: { type: "literal", value: null },
								},
							});
						} else {
							onChange({ params: undefined } as Record<string, unknown>);
						}
					}}
					className="rounded"
				/>
				Has output expression
			</label>
			{hasOutput && step.params?.output && (
				<ExpressionEditor
					label="Output"
					value={step.params.output as Expression}
					onChange={(val) => onChange({ params: { output: val } })}
				/>
			)}
			<label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
				<input
					type="checkbox"
					checked={hasSchema}
					onChange={(e) => {
						if (e.target.checked) {
							onWorkflowMetaChange?.({
								outputSchema: {
									type: "object",
									properties: {},
								},
							});
						} else {
							onWorkflowMetaChange?.({
								outputSchema: undefined,
							});
						}
					}}
					className="rounded"
				/>
				Workflow has output schema
			</label>
			{hasSchema && workflowOutputSchema && (
				<JsonEditor
					label="Output Schema (JSON Schema)"
					value={workflowOutputSchema}
					onChange={(val) => onWorkflowMetaChange?.({ outputSchema: val })}
				/>
			)}
		</div>
	);
}

function StepParamsEditor({
	step,
	onChange,
	availableToolNames,
	allStepIds,
	toolSchemas,
	workflowInputSchema,
	workflowOutputSchema,
	onWorkflowMetaChange,
}: {
	step: WorkflowStep;
	onChange: StepEditorPanelProps["onChange"];
	availableToolNames: string[];
	allStepIds: string[];
	toolSchemas?: ToolDefinitionMap;
	workflowInputSchema?: object;
	workflowOutputSchema?: object;
	onWorkflowMetaChange?: StepEditorPanelProps["onWorkflowMetaChange"];
}) {
	switch (step.type) {
		case "tool-call":
			return (
				<ToolCallParams
					step={step}
					onChange={onChange}
					availableToolNames={availableToolNames}
					toolSchemas={toolSchemas}
				/>
			);
		case "llm-prompt":
			return <LlmPromptParams step={step} onChange={onChange} />;
		case "extract-data":
			return <ExtractDataParams step={step} onChange={onChange} />;
		case "switch-case":
			return (
				<SwitchCaseParams
					step={step}
					onChange={onChange}
					allStepIds={allStepIds}
				/>
			);
		case "for-each":
			return (
				<ForEachParams
					step={step}
					onChange={onChange}
					allStepIds={allStepIds}
				/>
			);
		case "sleep":
			return <SleepParams step={step} onChange={onChange} />;
		case "wait-for-condition":
			return (
				<WaitForConditionParams
					step={step}
					onChange={onChange}
					allStepIds={allStepIds}
				/>
			);
		case "agent-loop":
			return (
				<AgentLoopParams
					step={step}
					onChange={onChange}
					availableToolNames={availableToolNames}
				/>
			);
		case "end":
			return (
				<EndParams
					step={step}
					onChange={onChange}
					workflowOutputSchema={workflowOutputSchema}
					onWorkflowMetaChange={onWorkflowMetaChange}
				/>
			);
		case "start":
			return (
				<StartParams
					workflowInputSchema={workflowInputSchema}
					onWorkflowMetaChange={onWorkflowMetaChange}
				/>
			);
	}
}

function DiagnosticsSection({ diagnostics }: { diagnostics: Diagnostic[] }) {
	if (diagnostics.length === 0) return null;
	const errors = diagnostics.filter((d) => d.severity === "error");
	const warnings = diagnostics.filter((d) => d.severity === "warning");

	return (
		<div className="space-y-1">
			{errors.map((d, i) => (
				<div
					key={`err-${d.code}-${i}`}
					className="flex gap-1.5 items-start text-[11px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded px-2 py-1.5 border border-red-200 dark:border-red-900"
				>
					<span className="shrink-0 font-medium">error</span>
					<span>{d.message}</span>
				</div>
			))}
			{warnings.map((d, i) => (
				<div
					key={`warn-${d.code}-${i}`}
					className="flex gap-1.5 items-start text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded px-2 py-1.5 border border-amber-200 dark:border-amber-900"
				>
					<span className="shrink-0 font-medium">warning</span>
					<span>{d.message}</span>
				</div>
			))}
		</div>
	);
}

export function StepEditorPanel({
	step,
	availableToolNames,
	allStepIds,
	toolSchemas,
	diagnostics = [],
	workflowInputSchema,
	workflowOutputSchema,
	onChange,
	onWorkflowMetaChange,
	onDelete,
	onClose,
}: StepEditorPanelProps) {
	return (
		<div className="w-[340px] border-l h-full min-h-0 overflow-y-auto shadow-lg bg-card border-border">
			<div className="sticky top-0 border-b px-4 py-3 flex items-center justify-between bg-card border-border">
				<div className="flex items-center gap-2 min-w-0">
					<TypeBadge type={step.type} />
				</div>
				<div className="flex items-center gap-1 shrink-0">
					<Button
						variant="ghost"
						size="xs"
						className="text-muted-foreground hover:text-foreground"
						onClick={onDelete}
						title="Delete step"
					>
						Delete
					</Button>
					<Button
						variant="ghost"
						size="icon-xs"
						onClick={onClose}
						className="text-muted-foreground hover:text-foreground"
					>
						&times;
					</Button>
				</div>
			</div>

			<div className="px-4 py-3 space-y-4">
				<DiagnosticsSection diagnostics={diagnostics} />

				<div>
					<Label>Name</Label>
					<Input
						value={step.name}
						onChange={(e) => onChange({ name: e.target.value })}
						className="h-8 text-sm"
						placeholder="Step name"
					/>
				</div>

				<StepIdInput value={step.id} onChange={(id) => onChange({ id })} />

				<div>
					<Label>Description</Label>
					<Textarea
						value={step.description}
						onChange={(e) => onChange({ description: e.target.value })}
						rows={2}
						className="text-xs font-mono resize-y"
						placeholder="Step description..."
					/>
				</div>

				<StepIdDropdown
					label="Next Step"
					value={step.nextStepId ?? ""}
					onChange={(id) =>
						onChange({
							nextStepId: id || undefined,
						} as Record<string, unknown>)
					}
					stepIds={allStepIds.filter((sid) => sid !== step.id)}
					allowEmpty
				/>

				<div className="border-t pt-3 border-border">
					<div className="text-[11px] font-medium uppercase tracking-wide mb-2 text-muted-foreground">
						Parameters
					</div>
					<StepParamsEditor
						step={step}
						onChange={onChange}
						availableToolNames={availableToolNames}
						allStepIds={allStepIds}
						toolSchemas={toolSchemas}
						workflowInputSchema={workflowInputSchema}
						workflowOutputSchema={workflowOutputSchema}
						onWorkflowMetaChange={onWorkflowMetaChange}
					/>
				</div>
			</div>
		</div>
	);
}

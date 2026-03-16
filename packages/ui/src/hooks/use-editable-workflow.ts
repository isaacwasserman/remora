import type { WorkflowDefinition, WorkflowStep } from "@remoraflow/core";
import { useCallback, useEffect, useRef, useState } from "react";

export interface UseEditableWorkflowOptions {
	workflow: WorkflowDefinition | null;
	onWorkflowChange?: (workflow: WorkflowDefinition) => void;
}

export interface UseEditableWorkflowReturn {
	/** The current working copy of the workflow. */
	workingWorkflow: WorkflowDefinition | null;
	addStep: (step: WorkflowStep, afterStepId?: string) => void;
	removeStep: (stepId: string) => void;
	updateStep: (stepId: string, updates: Record<string, unknown>) => void;
	connectSteps: (sourceId: string, targetId: string) => void;
	disconnectStep: (sourceId: string) => void;
	setInitialStepId: (stepId: string) => void;
	/** Update workflow-level properties (inputSchema, outputSchema). */
	updateWorkflowMeta: (updates: Partial<WorkflowDefinition>) => void;
}

function emptyWorkflow(): WorkflowDefinition {
	return { initialStepId: "", steps: [] };
}

export function useEditableWorkflow({
	workflow,
	onWorkflowChange,
}: UseEditableWorkflowOptions): UseEditableWorkflowReturn {
	const [workingWorkflow, setWorkingWorkflow] =
		useState<WorkflowDefinition | null>(workflow);
	const onChangeRef = useRef(onWorkflowChange);
	onChangeRef.current = onWorkflowChange;

	// Sync external workflow prop changes
	useEffect(() => {
		setWorkingWorkflow(workflow);
	}, [workflow]);

	const emit = useCallback((next: WorkflowDefinition) => {
		setWorkingWorkflow(next);
		onChangeRef.current?.(next);
	}, []);

	const addStep = useCallback(
		(step: WorkflowStep, afterStepId?: string) => {
			const wf = workingWorkflow ?? emptyWorkflow();
			const steps = [...wf.steps];
			steps.push(step);

			if (afterStepId) {
				const afterIdx = steps.findIndex((s) => s.id === afterStepId);
				if (afterIdx !== -1) {
					const afterStep = steps[afterIdx] as WorkflowStep;
					const prevNext = afterStep.nextStepId;
					// Insert new step into the chain
					steps[afterIdx] = { ...afterStep, nextStepId: step.id };
					if (prevNext && !step.nextStepId) {
						const newStepIdx = steps.findIndex((s) => s.id === step.id);
						if (newStepIdx !== -1) {
							steps[newStepIdx] = {
								...steps[newStepIdx],
								nextStepId: prevNext,
							} as WorkflowStep;
						}
					}
				}
			}

			const initialStepId =
				wf.initialStepId || (steps.length === 1 ? step.id : wf.initialStepId);
			emit({ ...wf, steps, initialStepId });
		},
		[workingWorkflow, emit],
	);

	const removeStep = useCallback(
		(stepId: string) => {
			if (!workingWorkflow) return;

			const removedStep = workingWorkflow.steps.find((s) => s.id === stepId);
			const successor = removedStep?.nextStepId;

			const steps = workingWorkflow.steps
				.filter((s) => s.id !== stepId)
				.map((s) => {
					// Re-link predecessors to the removed step's successor
					if (s.nextStepId === stepId) {
						return { ...s, nextStepId: successor } as WorkflowStep;
					}

					// Clean up group references
					if (s.type === "for-each" && s.params.loopBodyStepId === stepId) {
						return {
							...s,
							params: { ...s.params, loopBodyStepId: "" },
						} as WorkflowStep;
					}
					if (s.type === "switch-case") {
						const cases = s.params.cases.map((c) =>
							c.branchBodyStepId === stepId
								? { ...c, branchBodyStepId: "" }
								: c,
						);
						return { ...s, params: { ...s.params, cases } } as WorkflowStep;
					}
					if (
						s.type === "wait-for-condition" &&
						s.params.conditionStepId === stepId
					) {
						return {
							...s,
							params: { ...s.params, conditionStepId: "" },
						} as WorkflowStep;
					}

					return s;
				});

			let initialStepId = workingWorkflow.initialStepId;
			if (initialStepId === stepId) {
				initialStepId = successor ?? steps[0]?.id ?? "";
			}

			emit({ ...workingWorkflow, steps, initialStepId });
		},
		[workingWorkflow, emit],
	);

	const updateStep = useCallback(
		(stepId: string, updates: Record<string, unknown>) => {
			if (!workingWorkflow) return;

			const steps = workingWorkflow.steps.map((s) => {
				if (s.id !== stepId) {
					// If the ID changed, update references
					const newId = updates.id as string | undefined;
					if (newId) {
						let updated = s;
						if (s.nextStepId === stepId) {
							updated = { ...updated, nextStepId: newId } as WorkflowStep;
						}
						if (s.type === "for-each" && s.params.loopBodyStepId === stepId) {
							updated = {
								...updated,
								params: {
									...(updated as typeof s).params,
									loopBodyStepId: newId,
								},
							} as WorkflowStep;
						}
						if (s.type === "switch-case") {
							const cases = s.params.cases.map((c) =>
								c.branchBodyStepId === stepId
									? { ...c, branchBodyStepId: newId }
									: c,
							);
							if (
								cases.some(
									(c, i) =>
										c.branchBodyStepId !== s.params.cases[i]?.branchBodyStepId,
								)
							) {
								updated = {
									...updated,
									params: { ...(updated as typeof s).params, cases },
								} as WorkflowStep;
							}
						}
						if (
							s.type === "wait-for-condition" &&
							s.params.conditionStepId === stepId
						) {
							updated = {
								...updated,
								params: {
									...(updated as typeof s).params,
									conditionStepId: newId,
								},
							} as WorkflowStep;
						}
						return updated;
					}
					return s;
				}

				// Merge updates into the step
				const merged = { ...s } as Record<string, unknown>;
				for (const [key, value] of Object.entries(updates)) {
					if (key === "params" && value && typeof value === "object") {
						merged.params = {
							...(merged.params as Record<string, unknown>),
							...(value as Record<string, unknown>),
						};
					} else {
						merged[key] = value;
					}
				}
				return merged as WorkflowStep;
			});

			let initialStepId = workingWorkflow.initialStepId;
			const newId2 = updates.id as string | undefined;
			if (newId2 && initialStepId === stepId) {
				initialStepId = newId2;
			}

			emit({ ...workingWorkflow, steps, initialStepId });
		},
		[workingWorkflow, emit],
	);

	const connectSteps = useCallback(
		(sourceId: string, targetId: string) => {
			if (!workingWorkflow) return;

			// Clear any existing incoming references to targetId first,
			// since each step can only have one predecessor.
			function clearIncoming(steps: WorkflowStep[]): WorkflowStep[] {
				return steps.map((s) => {
					let updated: WorkflowStep = s;
					if (s.nextStepId === targetId) {
						updated = { ...updated, nextStepId: undefined } as WorkflowStep;
					}
					if (s.type === "for-each" && s.params.loopBodyStepId === targetId) {
						updated = {
							...updated,
							params: { ...s.params, loopBodyStepId: "" },
						} as WorkflowStep;
					}
					if (s.type === "switch-case") {
						const hasMatch = s.params.cases.some(
							(c) => c.branchBodyStepId === targetId,
						);
						if (hasMatch) {
							const cases = s.params.cases.map((c) =>
								c.branchBodyStepId === targetId
									? { ...c, branchBodyStepId: "" }
									: c,
							);
							updated = {
								...updated,
								params: { ...s.params, cases },
							} as WorkflowStep;
						}
					}
					if (
						s.type === "wait-for-condition" &&
						s.params.conditionStepId === targetId
					) {
						updated = {
							...updated,
							params: { ...s.params, conditionStepId: "" },
						} as WorkflowStep;
					}
					return updated;
				});
			}

			// Connection from a group header → set the group's child param
			if (sourceId.startsWith("__header__")) {
				const groupId = sourceId.replace("__header__", "");
				const steps = clearIncoming(workingWorkflow.steps).map((s) => {
					if (s.id !== groupId) return s;
					if (s.type === "for-each") {
						return {
							...s,
							params: { ...s.params, loopBodyStepId: targetId },
						} as WorkflowStep;
					}
					if (s.type === "switch-case") {
						let assigned = false;
						const cases = s.params.cases.map((c) => {
							if (!assigned && c.branchBodyStepId === "") {
								assigned = true;
								return { ...c, branchBodyStepId: targetId };
							}
							return c;
						});
						return {
							...s,
							params: { ...s.params, cases },
						} as WorkflowStep;
					}
					if (s.type === "wait-for-condition") {
						return {
							...s,
							params: { ...s.params, conditionStepId: targetId },
						} as WorkflowStep;
					}
					return s;
				});
				emit({ ...workingWorkflow, steps });
				return;
			}

			const steps = clearIncoming(workingWorkflow.steps).map((s) =>
				s.id === sourceId
					? ({ ...s, nextStepId: targetId } as WorkflowStep)
					: s,
			);

			emit({ ...workingWorkflow, steps });
		},
		[workingWorkflow, emit],
	);

	const disconnectStep = useCallback(
		(sourceId: string) => {
			if (!workingWorkflow) return;

			// Disconnection from a group header → clear the group's child param
			if (sourceId.startsWith("__header__")) {
				const groupId = sourceId.replace("__header__", "");
				const steps = workingWorkflow.steps.map((s) => {
					if (s.id !== groupId) return s;
					if (s.type === "for-each") {
						return {
							...s,
							params: { ...s.params, loopBodyStepId: "" },
						} as WorkflowStep;
					}
					if (s.type === "switch-case") {
						const cases = s.params.cases.map((c) => ({
							...c,
							branchBodyStepId: "",
						}));
						return {
							...s,
							params: { ...s.params, cases },
						} as WorkflowStep;
					}
					if (s.type === "wait-for-condition") {
						return {
							...s,
							params: { ...s.params, conditionStepId: "" },
						} as WorkflowStep;
					}
					return s;
				});
				emit({ ...workingWorkflow, steps });
				return;
			}

			const steps = workingWorkflow.steps.map((s) => {
				if (s.id !== sourceId) return s;
				const { nextStepId, ...rest } = s;
				return rest as WorkflowStep;
			});

			emit({ ...workingWorkflow, steps });
		},
		[workingWorkflow, emit],
	);

	const setInitialStepId = useCallback(
		(stepId: string) => {
			if (!workingWorkflow) return;
			emit({ ...workingWorkflow, initialStepId: stepId });
		},
		[workingWorkflow, emit],
	);

	const updateWorkflowMeta = useCallback(
		(updates: Partial<WorkflowDefinition>) => {
			if (!workingWorkflow) return;
			emit({ ...workingWorkflow, ...updates });
		},
		[workingWorkflow, emit],
	);

	return {
		workingWorkflow,
		addStep,
		removeStep,
		updateStep,
		connectSteps,
		disconnectStep,
		setInitialStepId,
		updateWorkflowMeta,
	};
}

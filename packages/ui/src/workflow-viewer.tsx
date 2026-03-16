import {
	compileWorkflow,
	type Diagnostic,
	type ExecutionState,
	extractToolSchemas,
	type StepExecutionRecord,
	type ToolDefinitionMap,
	type WorkflowDefinition,
	type WorkflowStep,
} from "@remoraflow/core";
import {
	Background,
	type Connection,
	Controls,
	type EdgeTypes,
	MiniMap,
	type NodeTypes,
	ReactFlow,
	useEdgesState,
	useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { ToolSet } from "ai";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CanvasContextMenu } from "./components/canvas-context-menu";
import { StepPalette } from "./components/step-palette";
import { WorkflowEdge } from "./edges/workflow-edge";
import { EditContext } from "./edit-context";
import type { StepExecutionSummary } from "./execution-state";
import {
	buildEditableLayout,
	buildLayout,
	GROUP_HEADER,
	GROUP_PADDING,
	type StepNodeData,
} from "./graph-layout";
import { useEditableWorkflow } from "./hooks/use-editable-workflow";
import { AgentLoopNode } from "./nodes/agent-loop-node";
import { EndNode } from "./nodes/end-node";
import { ExtractDataNode } from "./nodes/extract-data-node";
import { ForEachNode } from "./nodes/for-each-node";
import { GroupHeaderNode } from "./nodes/group-header-node";
import { LlmPromptNode } from "./nodes/llm-prompt-node";
import { SleepNode } from "./nodes/sleep-node";
import { StartNode } from "./nodes/start-node";
import { StartStepNode } from "./nodes/start-step-node";
import { SwitchCaseNode } from "./nodes/switch-case-node";
import { ToolCallNode } from "./nodes/tool-call-node";
import { WaitForConditionNode } from "./nodes/wait-for-condition-node";
import { StepDetailPanel } from "./panels/step-detail-panel";
import { StepEditorPanel } from "./panels/step-editor-panel";
import { useThemeColors } from "./theme";
import { createDefaultStep } from "./utils/step-defaults";

const nodeTypes: NodeTypes = {
	toolCall: ToolCallNode,
	llmPrompt: LlmPromptNode,
	extractData: ExtractDataNode,
	switchCase: SwitchCaseNode,
	groupHeader: GroupHeaderNode,
	forEach: ForEachNode,
	end: EndNode,
	start: StartNode,
	startStep: StartStepNode,
	sleep: SleepNode,
	waitForCondition: WaitForConditionNode,
	agentLoop: AgentLoopNode,
};

const edgeTypes: EdgeTypes = {
	workflow: WorkflowEdge,
};

const EMPTY_DIAGNOSTICS: Diagnostic[] = [];

/** Props for the {@link WorkflowViewer} component. */
export interface WorkflowViewerProps {
	/** The workflow definition to visualize. Pass `null` to start with an empty canvas (requires `isEditing`). */
	workflow: WorkflowDefinition | null;
	/** Compiler diagnostics to display on affected nodes. */
	diagnostics?: Diagnostic[];
	/** Called when a step node is clicked (with the step and its diagnostics) or when the selection is cleared (with `null`). */
	onStepSelect?: (step: WorkflowStep | null, diagnostics: Diagnostic[]) => void;
	/** Execution state to visualize on the workflow DAG. */
	executionState?: ExecutionState;
	/** Whether to show the minimap. @default true */
	showMinimap?: boolean;
	/** Width of the minimap in pixels (capped at 25% of viewer width). @default 200 */
	minimapWidth?: number;
	/** Height of the minimap in pixels. @default 150 */
	minimapHeight?: number;
	/** Enable editing mode. When true, nodes are draggable and editable. */
	isEditing?: boolean;
	/** Called when the workflow is modified in edit mode. */
	onWorkflowChange?: (workflow: WorkflowDefinition) => void;
	/** Tool definitions (AI SDK ToolSet). Used for tool name autocomplete in the editor. Execute functions are optional. */
	tools?: ToolSet;
}

/**
 * React component that renders a workflow as an interactive DAG using React Flow.
 * Supports step selection via callback, minimap, and zoom controls.
 *
 * Dark mode is detected automatically via the `dark` class on `<html>`,
 * following the shadcn/Tailwind convention (`darkMode: "class"`).
 *
 * Requires `@xyflow/react` as a peer dependency.
 *
 * @example
 * ```tsx
 * import { WorkflowViewer } from "remora/viewer";
 *
 * <WorkflowViewer
 *   workflow={myWorkflow}
 *   diagnostics={compileResult.diagnostics}
 *   executionState={executionState}
 *   onStepSelect={(step, diagnostics) => console.log("Selected:", step?.id)}
 * />
 * ```
 */
export function WorkflowViewer({
	workflow,
	diagnostics = EMPTY_DIAGNOSTICS,
	onStepSelect,
	executionState,
	showMinimap = true,
	minimapWidth = 200,
	minimapHeight = 150,
	isEditing = false,
	onWorkflowChange,
	tools,
}: WorkflowViewerProps) {
	const theme = useThemeColors();
	const containerRef = useRef<HTMLDivElement>(null);
	const [containerWidth, setContainerWidth] = useState(0);

	// Edit mode state
	const {
		workingWorkflow,
		addStep,
		removeStep,
		updateStep,
		connectSteps,
		disconnectStep,
		updateWorkflowMeta,
	} = useEditableWorkflow({ workflow, onWorkflowChange });

	const activeWorkflow = isEditing ? workingWorkflow : workflow;
	const positionOverridesRef = useRef<Map<string, { x: number; y: number }>>(
		new Map(),
	);
	const dimensionOverridesRef = useRef<
		Map<string, { width: number; height: number }>
	>(new Map());

	// Extract tool JSON schemas from the ToolSet (async)
	const [toolSchemas, setToolSchemas] = useState<ToolDefinitionMap>({});
	useEffect(() => {
		if (!tools) {
			setToolSchemas({});
			return;
		}
		let cancelled = false;
		extractToolSchemas(tools).then((schemas) => {
			if (!cancelled) setToolSchemas(schemas);
		});
		return () => {
			cancelled = true;
		};
	}, [tools]);

	// Live compilation for diagnostics in edit mode (debounced)
	const [editDiagnostics, setEditDiagnostics] = useState<Diagnostic[]>([]);
	useEffect(() => {
		if (!isEditing || !activeWorkflow) {
			setEditDiagnostics([]);
			return;
		}
		let cancelled = false;
		const timer = setTimeout(() => {
			compileWorkflow(activeWorkflow, { tools }).then((result) => {
				if (!cancelled) setEditDiagnostics(result.diagnostics);
			});
		}, 300);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [isEditing, activeWorkflow, tools]);

	// Use live diagnostics in edit mode, caller-provided diagnostics otherwise
	const activeDiagnostics = isEditing ? editDiagnostics : diagnostics;

	const [contextMenu, setContextMenu] = useState<{
		screenX: number;
		screenY: number;
		flowX: number;
		flowY: number;
		nodeId?: string;
	} | null>(null);

	// Structural fingerprint: only changes when layout-affecting properties change
	// (step IDs, types, connections). Data-only edits (name, description, params)
	// don't change this, so we can skip the full layout rebuild.
	const editStructuralKey = useMemo(() => {
		if (!isEditing || !activeWorkflow) return "";
		return `${activeWorkflow.steps
			.map((s) => {
				let key = `${s.id}:${s.type}:${s.nextStepId ?? ""}`;
				if (s.type === "for-each") key += `:loop=${s.params.loopBodyStepId}`;
				if (s.type === "switch-case")
					key += `:cases=${s.params.cases.map((c) => c.branchBodyStepId).join(",")}`;
				if (s.type === "wait-for-condition")
					key += `:cond=${s.params.conditionStepId}`;
				return key;
			})
			.join("|")}|init:${activeWorkflow.initialStepId}`;
	}, [isEditing, activeWorkflow]);

	const layout = useMemo(() => {
		if (isEditing) {
			return buildEditableLayout(
				activeWorkflow,
				activeDiagnostics,
				undefined,
				positionOverridesRef.current,
				dimensionOverridesRef.current,
			);
		}
		return buildLayout(activeWorkflow, activeDiagnostics, executionState);
	}, [activeWorkflow, activeDiagnostics, executionState, isEditing]);

	const [nodes, setNodes, onNodesChange] = useNodesState(layout.nodes);
	const [edges, setEdges, onEdgesChange] = useEdgesState(layout.edges);
	const nodesRef = useRef(nodes);
	nodesRef.current = nodes;
	const [selectedStep, setSelectedStep] = useState<WorkflowStep | null>(null);
	const [selectedDiagnostics, setSelectedDiagnostics] =
		useState<Diagnostic[]>(EMPTY_DIAGNOSTICS);
	const [selectedExecutionSummary, setSelectedExecutionSummary] = useState<
		StepExecutionSummary | undefined
	>();
	const [selectedExecutionRecords, setSelectedExecutionRecords] = useState<
		StepExecutionRecord[] | undefined
	>();

	const prevEditStructuralKeyRef = useRef(editStructuralKey);

	useEffect(() => {
		if (!isEditing) {
			// View mode: always apply the full layout
			setNodes(layout.nodes);
			setEdges(layout.edges);
			return;
		}

		const structureChanged =
			editStructuralKey !== prevEditStructuralKeyRef.current;
		prevEditStructuralKeyRef.current = editStructuralKey;

		if (structureChanged) {
			// Structure changed (add/remove step, connection change): full update
			setNodes(layout.nodes);
			setEdges(layout.edges);
			for (const node of layout.nodes) {
				if (!node.parentId) {
					positionOverridesRef.current.set(node.id, node.position);
				}
			}
		} else {
			// Data-only change (name, description, params, diagnostics):
			// patch node data in place so positions stay stable — no flicker.
			const dataMap = new Map(layout.nodes.map((n) => [n.id, n.data]));
			setNodes((prev) =>
				prev.map((n) => {
					const newData = dataMap.get(n.id);
					return newData ? { ...n, data: newData } : n;
				}),
			);
		}
	}, [layout, setNodes, setEdges, isEditing, editStructuralKey]);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (entry) setContainerWidth(entry.contentRect.width);
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	const effectiveMinimapWidth =
		containerWidth > 0
			? Math.min(minimapWidth, containerWidth * 0.25)
			: minimapWidth;
	const effectiveMinimapHeight =
		minimapHeight * (effectiveMinimapWidth / minimapWidth);

	// Available tool names from the tools prop
	const availableToolNames = useMemo(
		() => (tools ? Object.keys(tools) : []),
		[tools],
	);

	const allStepIds = useMemo(
		() => activeWorkflow?.steps.map((s) => s.id) ?? [],
		[activeWorkflow],
	);

	const clearSelection = useCallback(() => {
		setSelectedStep(null);
		setSelectedDiagnostics([]);
		setSelectedExecutionSummary(undefined);
		setSelectedExecutionRecords(undefined);
		onStepSelect?.(null, []);
	}, [onStepSelect]);

	const onNodeClick = useCallback(
		(_: React.MouseEvent, node: { id: string; data: unknown }) => {
			const data = node.data as StepNodeData;
			if (!data.step) return;
			setSelectedStep(data.step);
			setSelectedDiagnostics(data.diagnostics);
			setSelectedExecutionSummary(data.executionSummary);
			setSelectedExecutionRecords(
				executionState?.stepRecords.filter(
					(r: StepExecutionRecord) => r.stepId === data.step.id,
				),
			);
			onStepSelect?.(data.step, data.diagnostics);
		},
		[onStepSelect, executionState],
	);

	const onPaneClick = useCallback(() => {
		clearSelection();
		setContextMenu(null);
	}, [clearSelection]);

	// Edit mode: handle connections
	const onConnect = useCallback(
		(connection: Connection) => {
			if (!isEditing || !connection.source || !connection.target) return;
			connectSteps(connection.source, connection.target);
		},
		[isEditing, connectSteps],
	);

	// Edit mode: resize parent group to fit children.
	// `shrink` — when true (on drag stop), tightens the group to the bounding box;
	// when false (during drag), only expands outward.
	const resizeParentToFit = useCallback(
		(parentId: string, shrink: boolean) => {
			setNodes((nds) => {
				const parent = nds.find((n) => n.id === parentId);
				if (!parent) return nds;

				const children = nds.filter((n) => n.parentId === parentId);
				if (children.length === 0) return nds;

				let minX = Number.POSITIVE_INFINITY;
				let minY = Number.POSITIVE_INFINITY;
				let maxRight = 0;
				let maxBottom = 0;

				for (const child of children) {
					const childW = child.measured?.width ?? 300;
					const childH = child.measured?.height ?? 180;
					minX = Math.min(minX, child.position.x);
					minY = Math.min(minY, child.position.y);
					maxRight = Math.max(
						maxRight,
						child.position.x + childW + GROUP_PADDING,
					);
					maxBottom = Math.max(
						maxBottom,
						child.position.y + childH + GROUP_PADDING,
					);
				}

				const parentW =
					(parent.style?.width as number) ?? parent.measured?.width ?? 0;
				const parentH =
					(parent.style?.height as number) ?? parent.measured?.height ?? 0;

				// shiftX/Y: how much to push children right/down so they stay
				// within GROUP_PADDING / GROUP_HEADER margins.
				// During drag: only shift when children overflow left/top.
				// On shrink: also shift negative to remove excess left/top gap.
				const shiftX = shrink
					? GROUP_PADDING - minX
					: minX < GROUP_PADDING
						? GROUP_PADDING - minX
						: 0;
				const shiftY = shrink
					? GROUP_HEADER - minY
					: minY < GROUP_HEADER
						? GROUP_HEADER - minY
						: 0;

				// After shifting, maxRight/maxBottom move by the shift amount.
				const adjustedMaxRight = maxRight + shiftX;
				const adjustedMaxBottom = maxBottom + shiftY;

				// During drag: expand — width must grow by shiftX (left overflow)
				// and also accommodate right overflow. Never shrink.
				// On shrink: tight-fit to the adjusted bounding box.
				const newW = shrink
					? adjustedMaxRight
					: Math.max(parentW + shiftX, adjustedMaxRight);
				const newH = shrink
					? adjustedMaxBottom
					: Math.max(parentH + shiftY, adjustedMaxBottom);

				const needsShift = shiftX !== 0 || shiftY !== 0;
				const needsResize = newW !== parentW || newH !== parentH;

				if (!needsShift && !needsResize) return nds;

				dimensionOverridesRef.current.set(parentId, {
					width: newW,
					height: newH,
				});
				const newParentPos = {
					x: parent.position.x - shiftX,
					y: parent.position.y - shiftY,
				};
				positionOverridesRef.current.set(parentId, newParentPos);

				return nds.map((n) => {
					if (n.id === parentId) {
						const data = n.data as Record<string, unknown>;
						return {
							...n,
							position: newParentPos,
							style: { ...n.style, width: newW, height: newH },
							data: { ...data, groupWidth: newW, groupHeight: newH },
						};
					}
					if (n.parentId === parentId && needsShift) {
						const newPos = {
							x: n.position.x + shiftX,
							y: n.position.y + shiftY,
						};
						positionOverridesRef.current.set(n.id, newPos);
						return { ...n, position: newPos };
					}
					return n;
				});
			});
		},
		[setNodes],
	);

	// Edit mode: continuously expand parent while dragging child
	const onNodeDrag = useCallback(
		(
			_: React.MouseEvent,
			node: {
				id: string;
				parentId?: string;
				position: { x: number; y: number };
			},
		) => {
			if (!isEditing || !node.parentId) return;
			resizeParentToFit(node.parentId, false);
		},
		[isEditing, resizeParentToFit],
	);

	// Edit mode: track dragged positions and shrink-to-fit
	const onNodeDragStop = useCallback(
		(
			_: React.MouseEvent,
			node: {
				id: string;
				parentId?: string;
				position: { x: number; y: number };
			},
		) => {
			if (!isEditing) return;
			positionOverridesRef.current.set(node.id, node.position);
			if (node.parentId) {
				resizeParentToFit(node.parentId, true);
			}
		},
		[isEditing, resizeParentToFit],
	);

	// Edit mode: handle step deletion
	const handleDeleteStep = useCallback(
		(stepId: string) => {
			positionOverridesRef.current.delete(stepId);
			removeStep(stepId);
			if (selectedStep?.id === stepId) {
				clearSelection();
			}
		},
		[removeStep, selectedStep, clearSelection],
	);

	// Edit mode: select step for editing
	const handleSelectStepForEditing = useCallback(
		(stepId: string) => {
			const step = activeWorkflow?.steps.find((s) => s.id === stepId);
			if (step) {
				setSelectedStep(step);
				setSelectedDiagnostics(
					activeDiagnostics.filter((d) => d.location.stepId === stepId),
				);
			}
		},
		[activeWorkflow, activeDiagnostics],
	);

	// Edit mode: add step from palette or context menu
	const handleAddStep = useCallback(
		(type: WorkflowStep["type"], position?: { x: number; y: number }) => {
			const step = createDefaultStep(type);
			if (position) {
				positionOverridesRef.current.set(step.id, position);
			}
			addStep(step);
			// Select the newly added step for editing
			setSelectedStep(step);
			setSelectedDiagnostics([]);
		},
		[addStep],
	);

	// Edit mode: context menu handlers
	const onPaneContextMenu = useCallback(
		(event: React.MouseEvent | MouseEvent) => {
			if (!isEditing) return;
			event.preventDefault();
			const bounds = containerRef.current?.getBoundingClientRect();
			if (!bounds) return;
			setContextMenu({
				screenX:
					(event as MouseEvent).clientX ?? (event as React.MouseEvent).clientX,
				screenY:
					(event as MouseEvent).clientY ?? (event as React.MouseEvent).clientY,
				flowX: (event as React.MouseEvent).clientX - bounds.left,
				flowY: (event as React.MouseEvent).clientY - bounds.top,
			});
		},
		[isEditing],
	);

	const onNodeContextMenu = useCallback(
		(event: React.MouseEvent, node: { id: string }) => {
			if (!isEditing) return;
			event.preventDefault();
			setContextMenu({
				screenX: event.clientX,
				screenY: event.clientY,
				flowX: event.clientX,
				flowY: event.clientY,
				nodeId: node.id,
			});
		},
		[isEditing],
	);

	// Edit mode: keyboard delete
	const onKeyDown = useCallback(
		(event: React.KeyboardEvent) => {
			if (
				!isEditing ||
				!selectedStep ||
				(event.key !== "Delete" && event.key !== "Backspace")
			)
				return;
			// Don't delete if user is typing in an input
			const target = event.target as HTMLElement;
			if (
				target.tagName === "INPUT" ||
				target.tagName === "TEXTAREA" ||
				target.tagName === "SELECT" ||
				target.isContentEditable
			)
				return;
			handleDeleteStep(selectedStep.id);
		},
		[isEditing, selectedStep, handleDeleteStep],
	);

	// Edit mode: drag-to-add from palette
	const onDragOver = useCallback(
		(event: React.DragEvent) => {
			if (!isEditing) return;
			event.preventDefault();
			event.dataTransfer.dropEffect = "move";
		},
		[isEditing],
	);

	const onDrop = useCallback(
		(event: React.DragEvent) => {
			if (!isEditing) return;
			event.preventDefault();
			const stepType = event.dataTransfer.getData(
				"application/remora-step-type",
			) as WorkflowStep["type"] | "";
			if (!stepType) return;

			const bounds = containerRef.current?.getBoundingClientRect();
			if (!bounds) return;

			const position = {
				x: event.clientX - bounds.left,
				y: event.clientY - bounds.top,
			};

			handleAddStep(stepType, position);
		},
		[isEditing, handleAddStep],
	);

	// Keep selectedStep in sync with working workflow
	useEffect(() => {
		if (!selectedStep || !activeWorkflow) return;
		const updated = activeWorkflow.steps.find((s) => s.id === selectedStep.id);
		if (updated && updated !== selectedStep) {
			setSelectedStep(updated);
		}
	}, [activeWorkflow, selectedStep]);

	const editContextValue = useMemo(
		() => ({
			isEditing,
			onDeleteStep: handleDeleteStep,
			onDisconnectStep: disconnectStep,
			onSelectStepForEditing: handleSelectStepForEditing,
			availableToolNames,
			allStepIds,
		}),
		[
			isEditing,
			handleDeleteStep,
			disconnectStep,
			handleSelectStepForEditing,
			availableToolNames,
			allStepIds,
		],
	);

	return (
		<EditContext.Provider value={editContextValue}>
			<div
				role="application"
				className="flex h-full w-full min-h-0"
				onKeyDown={onKeyDown}
				tabIndex={-1}
			>
				<div ref={containerRef} className="flex-1 relative">
					<ReactFlow
						nodes={nodes}
						edges={edges}
						onNodesChange={onNodesChange}
						onEdgesChange={onEdgesChange}
						onNodeClick={onNodeClick}
						onPaneClick={onPaneClick}
						onConnect={isEditing ? onConnect : undefined}
						onNodeDrag={isEditing ? onNodeDrag : undefined}
						onNodeDragStop={isEditing ? onNodeDragStop : undefined}
						onPaneContextMenu={isEditing ? onPaneContextMenu : undefined}
						onNodeContextMenu={isEditing ? onNodeContextMenu : undefined}
						onDragOver={isEditing ? onDragOver : undefined}
						onDrop={isEditing ? onDrop : undefined}
						nodeTypes={nodeTypes}
						edgeTypes={edgeTypes}
						fitView
						fitViewOptions={{ padding: 0.2 }}
						nodesDraggable={isEditing}
						nodesConnectable={isEditing}
						defaultEdgeOptions={{
							type: "workflow",
						}}
						proOptions={{ hideAttribution: true }}
						colorMode={theme.dark ? "dark" : "light"}
					>
						<Background color={theme.border} size={3} />
						<Controls showInteractive={false} />
						{showMinimap && (
							<MiniMap
								nodeStrokeWidth={2}
								pannable
								zoomable
								style={{
									width: effectiveMinimapWidth,
									height: effectiveMinimapHeight,
									border: `1px solid ${theme.border}`,
									backgroundColor: theme.card,
								}}
								nodeColor={theme.mutedForeground}
							/>
						)}
					</ReactFlow>
					{isEditing && (
						<StepPalette onAddStep={(type) => handleAddStep(type)} />
					)}
					{contextMenu && (
						<CanvasContextMenu
							position={{
								x: contextMenu.screenX,
								y: contextMenu.screenY,
							}}
							canvasPosition={{
								x: contextMenu.flowX,
								y: contextMenu.flowY,
							}}
							onAddStep={(type, pos) => {
								handleAddStep(type, pos);
								setContextMenu(null);
							}}
							onClose={() => setContextMenu(null)}
							targetNodeId={contextMenu.nodeId}
							onDeleteNode={
								contextMenu.nodeId
									? (id) => {
											handleDeleteStep(id);
											setContextMenu(null);
										}
									: undefined
							}
							onEditNode={
								contextMenu.nodeId
									? (id) => {
											handleSelectStepForEditing(id);
											setContextMenu(null);
										}
									: undefined
							}
						/>
					)}
					{isEditing && !activeWorkflow?.steps.length && (
						<div className="absolute inset-0 flex items-center justify-center pointer-events-none">
							<div className="text-muted-foreground text-sm bg-card/80 rounded-lg px-6 py-4 border border-border">
								Add a step from the palette or right-click to get started
							</div>
						</div>
					)}
				</div>
				{selectedStep &&
					(isEditing ? (
						<StepEditorPanel
							step={selectedStep}
							availableToolNames={availableToolNames}
							allStepIds={allStepIds}
							toolSchemas={toolSchemas}
							diagnostics={editDiagnostics.filter(
								(d) => d.location.stepId === selectedStep.id,
							)}
							workflowInputSchema={
								activeWorkflow?.inputSchema as object | undefined
							}
							workflowOutputSchema={
								activeWorkflow?.outputSchema as object | undefined
							}
							onChange={(updates) => updateStep(selectedStep.id, updates)}
							onWorkflowMetaChange={updateWorkflowMeta}
							onDelete={() => handleDeleteStep(selectedStep.id)}
							onClose={clearSelection}
						/>
					) : (
						<StepDetailPanel
							step={selectedStep}
							diagnostics={selectedDiagnostics}
							executionSummary={selectedExecutionSummary}
							executionRecords={selectedExecutionRecords}
							onClose={clearSelection}
						/>
					))}
			</div>
		</EditContext.Provider>
	);
}

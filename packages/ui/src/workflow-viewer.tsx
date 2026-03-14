import type {
	Diagnostic,
	ExecutionState,
	StepExecutionRecord,
	WorkflowDefinition,
	WorkflowStep,
} from "@remoraflow/core";
import {
	Background,
	Controls,
	type EdgeTypes,
	MiniMap,
	type NodeTypes,
	ReactFlow,
	useEdgesState,
	useNodesState,
} from "@xyflow/react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WorkflowEdge } from "./edges/workflow-edge";
import type { StepExecutionSummary } from "./execution-state";
import { buildLayout, type StepNodeData } from "./graph-layout";
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
import { useThemeColors } from "./theme";

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
	/** The workflow definition to visualize. */
	workflow: WorkflowDefinition;
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
}: WorkflowViewerProps) {
	const theme = useThemeColors();
	const containerRef = useRef<HTMLDivElement>(null);
	const [containerWidth, setContainerWidth] = useState(0);
	const layout = useMemo(
		() => buildLayout(workflow, diagnostics, executionState),
		[workflow, diagnostics, executionState],
	);

	const [nodes, setNodes, onNodesChange] = useNodesState(layout.nodes);
	const [edges, setEdges, onEdgesChange] = useEdgesState(layout.edges);
	const [selectedStep, setSelectedStep] = useState<WorkflowStep | null>(null);
	const [selectedDiagnostics, setSelectedDiagnostics] =
		useState<Diagnostic[]>(EMPTY_DIAGNOSTICS);
	const [selectedExecutionSummary, setSelectedExecutionSummary] = useState<
		StepExecutionSummary | undefined
	>();
	const [selectedExecutionRecords, setSelectedExecutionRecords] = useState<
		StepExecutionRecord[] | undefined
	>();

	useEffect(() => {
		setNodes(layout.nodes);
		setEdges(layout.edges);
	}, [layout, setNodes, setEdges]);

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
		setSelectedStep(null);
		setSelectedDiagnostics([]);
		setSelectedExecutionSummary(undefined);
		setSelectedExecutionRecords(undefined);
		onStepSelect?.(null, []);
	}, [onStepSelect]);

	return (
		<div className="flex h-full w-full min-h-0">
			<div ref={containerRef} className="flex-1 relative">
				<ReactFlow
					nodes={nodes}
					edges={edges}
					onNodesChange={onNodesChange}
					onEdgesChange={onEdgesChange}
					onNodeClick={onNodeClick}
					onPaneClick={onPaneClick}
					nodeTypes={nodeTypes}
					edgeTypes={edgeTypes}
					fitView
					fitViewOptions={{ padding: 0.2 }}
					nodesDraggable={false}
					defaultEdgeOptions={{
						type: "workflow",
					}}
					proOptions={{ hideAttribution: true }}
					colorMode={theme.dark ? "dark" : "light"}
				>
					<Background color={theme.border} gap={16} />
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
			</div>
			{selectedStep && (
				<StepDetailPanel
					step={selectedStep}
					diagnostics={selectedDiagnostics}
					executionSummary={selectedExecutionSummary}
					executionRecords={selectedExecutionRecords}
					onClose={() => {
						setSelectedStep(null);
						setSelectedDiagnostics([]);
						setSelectedExecutionSummary(undefined);
						setSelectedExecutionRecords(undefined);
						onStepSelect?.(null, []);
					}}
				/>
			)}
		</div>
	);
}

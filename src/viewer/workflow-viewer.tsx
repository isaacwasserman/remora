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
import { useCallback, useEffect, useMemo } from "react";
import type { Diagnostic } from "../compiler/types";
import type { WorkflowDefinition, WorkflowStep } from "../types";
import { WorkflowEdge } from "./edges/workflow-edge";
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
import { ViewerThemeProvider } from "./theme";

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
	/** Enable dark mode styling. Defaults to `false`. */
	dark?: boolean;
}

/**
 * React component that renders a workflow as an interactive DAG using React Flow.
 * Supports step selection via callback, minimap, and zoom controls.
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
 *   onStepSelect={(step, diagnostics) => console.log("Selected:", step?.id)}
 * />
 * ```
 */
export function WorkflowViewer({
	workflow,
	diagnostics = EMPTY_DIAGNOSTICS,
	onStepSelect,
	dark = false,
}: WorkflowViewerProps) {
	const theme = useMemo(() => ({ dark }), [dark]);
	const layout = useMemo(
		() => buildLayout(workflow, diagnostics),
		[workflow, diagnostics],
	);

	const [nodes, setNodes, onNodesChange] = useNodesState(layout.nodes);
	const [edges, setEdges, onEdgesChange] = useEdgesState(layout.edges);

	useEffect(() => {
		setNodes(layout.nodes);
		setEdges(layout.edges);
	}, [layout, setNodes, setEdges]);

	const onNodeClick = useCallback(
		(_: React.MouseEvent, node: { id: string; data: unknown }) => {
			const data = node.data as StepNodeData;
			if (!data.step) return;
			onStepSelect?.(data.step, data.diagnostics);
		},
		[onStepSelect],
	);

	const onPaneClick = useCallback(() => {
		onStepSelect?.(null, []);
	}, [onStepSelect]);

	return (
		<ViewerThemeProvider value={theme}>
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
				colorMode={dark ? "dark" : "light"}
			>
				<Background color={dark ? "#4b5563" : "#e5e7eb"} gap={16} />
				<Controls showInteractive={false} />
				<MiniMap
					nodeStrokeWidth={2}
					pannable
					zoomable
					style={{
						border: `1px solid ${dark ? "#374151" : "#e5e7eb"}`,
						backgroundColor: dark ? "#1f2937" : undefined,
					}}
					nodeColor={
						dark ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.1)"
					}
				/>
			</ReactFlow>
		</ViewerThemeProvider>
	);
}

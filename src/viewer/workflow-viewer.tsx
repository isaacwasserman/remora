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
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Diagnostic } from "../compiler/types";
import type { WorkflowDefinition, WorkflowStep } from "../types";
import { WorkflowEdge } from "./edges/workflow-edge";
import { buildLayout, type StepNodeData } from "./graph-layout";
import { EndNode } from "./nodes/end-node";
import { ExtractDataNode } from "./nodes/extract-data-node";
import { ForEachNode } from "./nodes/for-each-node";
import { GroupHeaderNode } from "./nodes/group-header-node";
import { LlmPromptNode } from "./nodes/llm-prompt-node";
import { StartNode } from "./nodes/start-node";
import { SwitchCaseNode } from "./nodes/switch-case-node";
import { ToolCallNode } from "./nodes/tool-call-node";
import { StepDetailPanel } from "./panels/step-detail-panel";

const nodeTypes: NodeTypes = {
	toolCall: ToolCallNode,
	llmPrompt: LlmPromptNode,
	extractData: ExtractDataNode,
	switchCase: SwitchCaseNode,
	groupHeader: GroupHeaderNode,
	forEach: ForEachNode,
	end: EndNode,
	start: StartNode,
};

const edgeTypes: EdgeTypes = {
	workflow: WorkflowEdge,
};

const EMPTY_DIAGNOSTICS: Diagnostic[] = [];

export interface WorkflowViewerProps {
	workflow: WorkflowDefinition;
	diagnostics?: Diagnostic[];
	onStepSelect?: (stepId: string | null) => void;
}

export function WorkflowViewer({
	workflow,
	diagnostics = EMPTY_DIAGNOSTICS,
	onStepSelect,
}: WorkflowViewerProps) {
	const layout = useMemo(
		() => buildLayout(workflow, diagnostics),
		[workflow, diagnostics],
	);

	const [nodes, setNodes, onNodesChange] = useNodesState(layout.nodes);
	const [edges, setEdges, onEdgesChange] = useEdgesState(layout.edges);
	const [selectedStep, setSelectedStep] = useState<WorkflowStep | null>(null);
	const [selectedDiagnostics, setSelectedDiagnostics] =
		useState<Diagnostic[]>(EMPTY_DIAGNOSTICS);

	useEffect(() => {
		setNodes(layout.nodes);
		setEdges(layout.edges);
		setSelectedStep(null);
	}, [layout, setNodes, setEdges]);

	const onNodeClick = useCallback(
		(_: React.MouseEvent, node: { id: string; data: unknown }) => {
			const data = node.data as StepNodeData;
			if (!data.step) return;
			setSelectedStep(data.step);
			setSelectedDiagnostics(data.diagnostics);
			onStepSelect?.(data.step.id);
		},
		[onStepSelect],
	);

	const onPaneClick = useCallback(() => {
		setSelectedStep(null);
		setSelectedDiagnostics([]);
		onStepSelect?.(null);
	}, [onStepSelect]);

	return (
		<div className="flex h-full w-full">
			<div className="flex-1 relative">
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
				>
					<Background color="#e5e7eb" gap={16} />
					<Controls showInteractive={false} />
					<MiniMap
						nodeStrokeWidth={2}
						pannable
						zoomable
						style={{ border: "1px solid #e5e7eb" }}
						nodeColor={"rgba(0, 0, 0, 0.1)"}
					/>
				</ReactFlow>
			</div>
			{selectedStep && (
				<StepDetailPanel
					step={selectedStep}
					diagnostics={selectedDiagnostics}
					onClose={() => {
						setSelectedStep(null);
						setSelectedDiagnostics([]);
						onStepSelect?.(null);
					}}
				/>
			)}
		</div>
	);
}

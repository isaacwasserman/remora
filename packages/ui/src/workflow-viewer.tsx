import {
  compileWorkflow,
  type Diagnostic,
  type ExecutionState,
  extractToolSchemas,
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
import { Braces, LayoutGrid } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CanvasContextMenu } from "./components/canvas-context-menu";
import { StepPalette } from "./components/step-palette";
import { WorkflowJsonDialog } from "./components/workflow-json-dialog";
import { WorkflowEdge } from "./edges/workflow-edge";
import { EditContext } from "./edit-context";
import {
  buildEditableLayout,
  buildLayout,
  GROUP_HEADER,
  GROUP_PADDING,
} from "./graph-layout";
import { useContextMenu } from "./hooks/use-context-menu";
import { useEditableWorkflow } from "./hooks/use-editable-workflow";
import { useSelectionState } from "./hooks/use-selection-state";
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
import { groupStructuralKey } from "./utils/group-refs";
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

import { EMPTY_DIAGNOSTICS } from "./hooks/use-selection-state";

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
  /** Whether the workflow execution is currently paused. */
  paused?: boolean;
  /** Enable editing mode. When true, nodes are draggable and editable. */
  isEditing?: boolean;
  /** Called when the workflow is modified in edit mode. */
  onWorkflowChange?: (workflow: WorkflowDefinition) => void;
  /** Tool definitions (AI SDK ToolSet). Used for tool name autocomplete in the editor. Execute functions are optional. */
  tools?: ToolSet;
  /** Pre-extracted tool schemas. When provided, skips extracting schemas from `tools`. */
  toolSchemas?: ToolDefinitionMap;
  /** Hide the built-in detail/editor panel. Use this when rendering `StepDetailPanel` or `StepEditorPanel` externally. */
  hideDetailPanel?: boolean;
}

/**
 * React component that renders a workflow as an interactive DAG using React Flow.
 * Supports step selection via callback, minimap, and zoom controls.
 *
 * Dark mode is detected automatically via the `dark` class on `<html>`,
 * following the shadcn/Tailwind convention (`darkMode: "class"`).
 *
 * Requires `@xyflow/react` as a peer dependency.
 */
export function WorkflowViewer({
  workflow,
  diagnostics = EMPTY_DIAGNOSTICS,
  onStepSelect,
  executionState,
  paused = false,
  showMinimap = true,
  minimapWidth = 200,
  minimapHeight = 150,
  isEditing = false,
  onWorkflowChange,
  tools,
  toolSchemas: toolSchemasProp,
  hideDetailPanel = false,
}: WorkflowViewerProps) {
  const theme = useThemeColors();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // --- Editing operations ---
  const {
    workingWorkflow,
    addStep,
    removeStep,
    updateStep,
    connectSteps,
    disconnectStep,
    updateWorkflowMeta,
  } = useEditableWorkflow({ workflow, onWorkflowChange });

  const [showJsonDialog, setShowJsonDialog] = useState(false);

  const activeWorkflow = isEditing ? workingWorkflow : workflow;
  const positionOverridesRef = useRef<Map<string, { x: number; y: number }>>(
    new Map(),
  );
  const dimensionOverridesRef = useRef<
    Map<string, { width: number; height: number }>
  >(new Map());

  // --- Tool schemas ---
  const [toolSchemas, setToolSchemas] = useState<ToolDefinitionMap>({});
  useEffect(() => {
    if (toolSchemasProp) {
      setToolSchemas(toolSchemasProp);
      return;
    }
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
  }, [tools, toolSchemasProp]);

  // --- Live diagnostics ---
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

  const activeDiagnostics = isEditing ? editDiagnostics : diagnostics;

  // --- Layout computation ---
  const editStructuralKey = useMemo(() => {
    if (!isEditing || !activeWorkflow) return "";
    return `${activeWorkflow.steps
      .map(
        (s) =>
          `${s.id}:${s.type}:${s.nextStepId ?? ""}${groupStructuralKey(s)}`,
      )
      .join("|")}|init:${activeWorkflow.initialStepId}`;
  }, [isEditing, activeWorkflow]);

  // Structural key for view mode — changes only when the workflow graph shape changes,
  // not when execution state updates. This lets us skip full layout rebuilds during execution.
  const viewStructuralKey = useMemo(() => {
    if (isEditing || !activeWorkflow) return "";
    return `${activeWorkflow.steps
      .map(
        (s) =>
          `${s.id}:${s.type}:${s.nextStepId ?? ""}${groupStructuralKey(s)}`,
      )
      .join("|")}|init:${activeWorkflow.initialStepId}`;
  }, [isEditing, activeWorkflow]);

  const prevViewStructuralKeyRef = useRef(viewStructuralKey);
  const prevIsEditingRef = useRef(isEditing);

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
    return buildLayout(
      activeWorkflow,
      activeDiagnostics,
      executionState,
      undefined,
      paused,
    );
  }, [activeWorkflow, activeDiagnostics, executionState, isEditing, paused]);

  const [nodes, setNodes, onNodesChange] = useNodesState(layout.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layout.edges);

  const prevEditStructuralKeyRef = useRef(editStructuralKey);

  useEffect(() => {
    const wasEditing = prevIsEditingRef.current;
    prevIsEditingRef.current = isEditing;

    if (!isEditing) {
      const justLeftEditMode = wasEditing;
      const viewStructureChanged =
        viewStructuralKey !== prevViewStructuralKeyRef.current;
      prevViewStructuralKeyRef.current = viewStructuralKey;

      if (justLeftEditMode) {
        // Leaving edit mode — clear drag/resize overrides and do a full
        // auto-layout so the graph snaps back to clean Dagre positions.
        positionOverridesRef.current.clear();
        dimensionOverridesRef.current.clear();
        const fresh = buildLayout(
          activeWorkflow,
          activeDiagnostics,
          executionState,
          undefined,
          paused,
        );
        setNodes(fresh.nodes);
        setEdges(fresh.edges);
      } else if (viewStructureChanged) {
        // Workflow graph shape changed — full layout reset needed
        setNodes(layout.nodes);
        setEdges(layout.edges);
      } else {
        // Structure is the same — only update node data (execution summaries)
        // and edge data (executed flags) to avoid position recalculation flicker
        const dataMap = new Map(layout.nodes.map((n) => [n.id, n.data]));
        setNodes((prev) =>
          prev.map((n) => {
            const newData = dataMap.get(n.id);
            return newData ? { ...n, data: newData } : n;
          }),
        );
        const edgeDataMap = new Map(layout.edges.map((e) => [e.id, e.data]));
        setEdges((prev) =>
          prev.map((e) => {
            const newData = edgeDataMap.get(e.id);
            return newData ? { ...e, data: newData } : e;
          }),
        );
      }
      return;
    }

    const structureChanged =
      editStructuralKey !== prevEditStructuralKeyRef.current;
    prevEditStructuralKeyRef.current = editStructuralKey;

    if (structureChanged) {
      // Clear user drag/resize overrides — old positions are meaningless
      // for the new structure. Don't store dagre positions as overrides;
      // overrides should only come from explicit user actions (drag/resize).
      positionOverridesRef.current.clear();
      dimensionOverridesRef.current.clear();
      setNodes(layout.nodes);
      setEdges(layout.edges);
    } else {
      const dataMap = new Map(layout.nodes.map((n) => [n.id, n.data]));
      setNodes((prev) =>
        prev.map((n) => {
          const newData = dataMap.get(n.id);
          return newData ? { ...n, data: newData } : n;
        }),
      );
    }
  }, [
    layout,
    setNodes,
    setEdges,
    isEditing,
    editStructuralKey,
    viewStructuralKey,
    activeWorkflow,
    activeDiagnostics,
    executionState,
    paused,
  ]);

  // --- Container resize ---
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

  // --- Derived data ---
  const availableToolNames = useMemo(
    () =>
      toolSchemasProp
        ? Object.keys(toolSchemasProp)
        : tools
          ? Object.keys(tools)
          : [],
    [tools, toolSchemasProp],
  );

  const allStepIds = useMemo(
    () => activeWorkflow?.steps.map((s) => s.id) ?? [],
    [activeWorkflow],
  );

  // --- Selection ---
  const {
    selectedStep,
    selectedDiagnostics,
    selectedExecutionSummary,
    selectedExecutionRecords,
    clearSelection,
    onNodeClick,
    selectStepForEditing,
    setSelectedStep,
    setSelectedDiagnostics,
  } = useSelectionState({
    activeWorkflow,
    activeDiagnostics,
    executionState,
    onStepSelect,
  });

  // --- Context menu ---
  const {
    contextMenu,
    onPaneContextMenu,
    onNodeContextMenu,
    closeContextMenu,
  } = useContextMenu(isEditing, containerRef);

  const onPaneClick = useCallback(() => {
    clearSelection();
    closeContextMenu();
  }, [clearSelection, closeContextMenu]);

  // --- Edit mode: connections ---
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!isEditing || !connection.source || !connection.target) return;
      connectSteps(connection.source, connection.target);
    },
    [isEditing, connectSteps],
  );

  // --- Edit mode: group resize on drag ---
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

        const adjustedMaxRight = maxRight + shiftX;
        const adjustedMaxBottom = maxBottom + shiftY;

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
      resizeParentToFit(node.parentId, true);
    },
    [isEditing, resizeParentToFit],
  );

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

  // --- Edit mode: step operations ---
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

  const handleAddStep = useCallback(
    (type: WorkflowStep["type"], position?: { x: number; y: number }) => {
      const existingIds = new Set(activeWorkflow?.steps.map((s) => s.id) ?? []);
      const step = createDefaultStep(type, undefined, existingIds);
      if (position) {
        positionOverridesRef.current.set(step.id, position);
      }
      addStep(step);
      setSelectedStep(step);
      setSelectedDiagnostics([]);
    },
    [addStep, setSelectedStep, setSelectedDiagnostics, activeWorkflow],
  );

  // --- Edit mode: keyboard ---
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (
        !isEditing ||
        !selectedStep ||
        (event.key !== "Delete" && event.key !== "Backspace")
      )
        return;
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

  // --- Edit mode: drag-to-add ---
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

  // --- Edit mode: auto-layout ---
  const handleAutoLayout = useCallback(() => {
    positionOverridesRef.current.clear();
    dimensionOverridesRef.current.clear();
    const fresh = buildEditableLayout(
      activeWorkflow,
      activeDiagnostics,
      undefined,
      undefined,
      undefined,
    );
    setNodes(fresh.nodes);
    setEdges(fresh.edges);
  }, [activeWorkflow, activeDiagnostics, setNodes, setEdges]);

  // --- Edit context ---
  const editContextValue = useMemo(
    () => ({
      isEditing,
      onDeleteStep: handleDeleteStep,
      onDisconnectStep: disconnectStep,
      onSelectStepForEditing: selectStepForEditing,
      availableToolNames,
      allStepIds,
    }),
    [
      isEditing,
      handleDeleteStep,
      disconnectStep,
      selectStepForEditing,
      availableToolNames,
      allStepIds,
    ],
  );

  // --- Render ---
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
                nodeColor={"rgba(0, 0, 0, 0.1)"}
              />
            )}
          </ReactFlow>
          <div className="absolute top-3 left-3 z-10 flex flex-col gap-2">
            <div className="flex rounded-lg border border-border shadow-md overflow-hidden bg-card divide-x divide-border">
              {isEditing && (
                <button
                  type="button"
                  onClick={handleAutoLayout}
                  title="Auto-layout"
                  className="px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted/50 transition-colors flex items-center gap-1.5"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Auto-layout</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowJsonDialog(true)}
                title="View JSON"
                className="px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted/50 transition-colors flex items-center gap-1.5"
              >
                <Braces className="w-3.5 h-3.5" />
                <span>JSON</span>
              </button>
            </div>
            {isEditing && (
              <StepPalette onAddStep={(type) => handleAddStep(type)} />
            )}
          </div>
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
                closeContextMenu();
              }}
              onClose={closeContextMenu}
              targetNodeId={contextMenu.nodeId}
              onDeleteNode={
                contextMenu.nodeId
                  ? (id) => {
                      handleDeleteStep(id);
                      closeContextMenu();
                    }
                  : undefined
              }
              onEditNode={
                contextMenu.nodeId
                  ? (id) => {
                      selectStepForEditing(id);
                      closeContextMenu();
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
        {!hideDetailPanel &&
          selectedStep &&
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
      {showJsonDialog && (
        <WorkflowJsonDialog
          workflow={activeWorkflow}
          isEditing={isEditing}
          onApply={(wf) => onWorkflowChange?.(wf)}
          onClose={() => setShowJsonDialog(false)}
        />
      )}
    </EditContext.Provider>
  );
}

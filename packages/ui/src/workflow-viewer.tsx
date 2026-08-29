import {
    type ExecutionState,
    extractToolSchemas,
    type RemoraflowSettings,
    remoraflowSettingsSchema,
    type ScopeBinding,
    scopeAt,
    type ToolDefinitionMap,
    type ValidatorDiagnostic,
    validateWorkflowDefinition,
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
    type OnNodesChange,
    ReactFlow,
    useEdgesState,
    useNodes,
    useNodesState,
    useReactFlow,
    useUpdateNodeInternals,
} from "@xyflow/react";
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
    derivePathSequenceIndexes,
    deriveStepSummaries,
} from "./execution-state";
import {
    buildEditableLayout,
    buildLayout,
    GROUP_HEADER,
    GROUP_PADDING,
    type LayoutDirection,
} from "./graph-layout";
import { useContextMenu } from "./hooks/use-context-menu";
import { useEditableWorkflow } from "./hooks/use-editable-workflow";
import { useSelectionState } from "./hooks/use-selection-state";
import { GroupContainerNode } from "./nodes/group-container-node";
import { GroupHeaderNode } from "./nodes/group-header-node";
import { StartNode } from "./nodes/start-node";
import { StepNode } from "./nodes/step-node";
import { StepDetailPanel } from "./panels/step-detail-panel";
import { StepEditorPanel } from "./panels/step-editor-panel";
import { useDarkMode } from "./theme";
import { ToolSchemasContext } from "./tool-schemas-context";
import { groupStructuralKey } from "./utils/nested-chain-refs";
import { createDefaultStep } from "./utils/step-defaults";
import { buildStubTools } from "./utils/stub-tools";

const nodeTypes: NodeTypes = {
    stepNode: StepNode,
    groupContainer: GroupContainerNode,
    groupHeader: GroupHeaderNode,
    start: StartNode,
};

const edgeTypes: EdgeTypes = {
    workflow: WorkflowEdge,
};

import { EMPTY_DIAGNOSTICS } from "./hooks/use-selection-state";

const FIT_VIEW_OPTIONS = { padding: 0.2, maxZoom: 1 };

/**
 * Forces React Flow to recalculate handle positions when layout direction
 * changes so edges connect at the correct side (left/right vs top/bottom).
 * Must be rendered inside `<ReactFlow>` to access the React Flow context.
 */
function HandlePositionUpdater({ direction }: { direction: LayoutDirection }) {
    const nodes = useNodes();
    const updateNodeInternals = useUpdateNodeInternals();
    const { fitView } = useReactFlow();
    const appliedDirection = useRef(direction);

    useEffect(() => {
        // Check if any node's layoutDirection differs from what we last applied.
        const needsUpdate = nodes.some((n) => {
            const d = (n.data as Record<string, unknown>)?.layoutDirection;
            return d !== undefined && d !== appliedDirection.current;
        });
        if (!needsUpdate) return;

        appliedDirection.current = direction;
        const ids = nodes.map((n) => n.id);
        if (ids.length === 0) return;

        const raf = requestAnimationFrame(() => {
            updateNodeInternals(ids);
            fitView(FIT_VIEW_OPTIONS);
        });
        return () => cancelAnimationFrame(raf);
    }, [direction, nodes, updateNodeInternals, fitView]);

    return null;
}

/** Props for the {@link WorkflowViewer} component. */
export interface WorkflowViewerProps {
    /** The workflow definition to visualize. Pass `null` to start with an empty canvas (requires `isEditing`). */
    workflow: WorkflowDefinition | null;
    /** Compiler diagnostics to display on affected nodes. */
    diagnostics?: ValidatorDiagnostic[];
    /** Called when a step node is clicked (with the step and its diagnostics) or when the selection is cleared (with `null`). */
    onStepSelect?: (
        step: WorkflowStep | null,
        diagnostics: ValidatorDiagnostic[],
    ) => void;
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
    /**
     * Pre-extracted tool schemas. When provided, skips extracting schemas from
     * `tools`. Each schema may include an optional `displayName` to render a
     * human-friendly label in the UI; the compiled workflow continues to
     * reference tools by their actual keys.
     */
    toolSchemas?: ToolDefinitionMap;
    /** Hide the built-in detail/editor panel. Use this when rendering `StepDetailPanel` or `StepEditorPanel` externally. */
    hideDetailPanel?: boolean;
    /** Controls whether the DAG flows top-to-bottom (`"vertical"`) or left-to-right (`"horizontal"`). @see {@link LayoutDirection} */
    layout?: LayoutDirection;
    /**
     * A subset of remoraflow settings. The `features` flags gate which step
     * types are available in the editor palette and are honored by local
     * validation. Omit to use schema defaults (`allowAgentLoops: true`,
     * `allowUserIntervention: false`).
     */
    settings?: RemoraflowSettings;
    /**
     * Controls who owns validation.
     * - `"internal"` (default): the viewer runs its own validator and merges
     *   results with any `diagnostics` prop. When internal validation finds
     *   zero errors, the viewer shows a clean state even if the consumer's
     *   `diagnostics` prop is stale.
     * - `"external"`: the viewer does not run its own validator and uses
     *   `diagnostics` as-is.
     */
    validation?: "internal" | "external";
    onDiagnosticsChange?: (diagnostics: ValidatorDiagnostic[]) => void;
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
    layout: direction = "vertical",
    settings,
    validation = "internal",
    onDiagnosticsChange,
}: WorkflowViewerProps) {
    const resolvedSettings = useMemo(
        () => remoraflowSettingsSchema.assert(settings ?? {}),
        [settings],
    );
    const features = resolvedSettings.features;
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(0);
    const isDark = useDarkMode();

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

    // Real DOM dimensions captured from React Flow's onNodesChange events,
    // used instead of heuristic estimates for accurate dagre sizing.
    const measuredDimensionsRef = useRef<
        Map<string, { width: number; height: number }>
    >(new Map());
    const initialMeasureDoneRef = useRef(false);
    // Hidden until the first measurement-based re-layout completes to
    // avoid flashing the heuristic-estimated layout.
    const [layoutReady, setLayoutReady] = useState(false);

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
    const [localDiagnostics, setLocalDiagnostics] = useState<
        ValidatorDiagnostic[]
    >([]);
    useEffect(() => {
        if (validation === "external" || !activeWorkflow) {
            setLocalDiagnostics([]);
            return;
        }
        const validationTools = tools ?? buildStubTools(toolSchemas);
        const timer = setTimeout(() => {
            const { diagnostics: result } = validateWorkflowDefinition(
                activeWorkflow,
                // biome-ignore lint/suspicious/noExplicitAny: ToolSet is structurally compatible with StubbedToolSet
                { tools: validationTools as any, options: resolvedSettings },
                {
                    assertToolsHaveExecutionFunctions: false,
                    assertToolsHaveOutputSchemas: false,
                },
            );
            setLocalDiagnostics(result);
            onDiagnosticsChange?.(result);
        }, 300);
        return () => clearTimeout(timer);
    }, [
        activeWorkflow,
        tools,
        toolSchemas,
        resolvedSettings,
        validation,
        onDiagnosticsChange,
    ]);

    const activeDiagnostics =
        validation === "external" ? diagnostics : localDiagnostics;

    const [highlightedExecutionId, setHighlightedExecutionId] = useState<
        string | undefined
    >();
    const pathSequenceIndexes = useMemo(
        () =>
            executionState
                ? derivePathSequenceIndexes(
                      executionState,
                      highlightedExecutionId,
                  )
                : new Map<string, number[]>(),
        [executionState, highlightedExecutionId],
    );

    // --- Layout computation ---
    const editStructuralKey = useMemo(() => {
        if (!isEditing || !activeWorkflow) return "";
        return `${activeWorkflow.steps
            .map(
                (s) =>
                    `${s.id}:${s.type}:${s.nextStepId ?? ""}${groupStructuralKey(s)}`,
            )
            .join("|")}|init:${activeWorkflow.initialStepId}|dir:${direction}`;
    }, [isEditing, activeWorkflow, direction]);

    // Structural key for view mode — changes only when the workflow graph shape changes,
    // not when execution state updates. This lets us skip full layout rebuilds during execution.
    const viewStructuralKey = useMemo(() => {
        if (isEditing || !activeWorkflow) return "";
        return `${activeWorkflow.steps
            .map(
                (s) =>
                    `${s.id}:${s.type}:${s.nextStepId ?? ""}${groupStructuralKey(s)}`,
            )
            .join("|")}|init:${activeWorkflow.initialStepId}|dir:${direction}`;
    }, [isEditing, activeWorkflow, direction]);

    const prevViewStructuralKeyRef = useRef(viewStructuralKey);
    const prevIsEditingRef = useRef(isEditing);

    const _structuralKey = isEditing ? editStructuralKey : viewStructuralKey;
    const layout = useMemo(() => {
        const dims =
            layoutReady && measuredDimensionsRef.current.size > 0
                ? measuredDimensionsRef.current
                : undefined;
        if (isEditing) {
            return buildEditableLayout(
                activeWorkflow,
                activeDiagnostics,
                undefined,
                positionOverridesRef.current,
                dimensionOverridesRef.current,
                dims,
                direction,
            );
        }
        return buildLayout(
            activeWorkflow,
            activeDiagnostics,
            executionState,
            dims,
            paused,
            direction,
            pathSequenceIndexes,
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps -- relayout
        // only when graph structure changes, not on every diagnostic/execution
        // update. Node data is patched in-place below.
    }, [
        isEditing,
        direction,
        layoutReady,
        activeDiagnostics,
        activeWorkflow,
        executionState,
        paused,
        pathSequenceIndexes,
    ]);

    const [nodes, setNodes, onNodesChangeBase] = useNodesState(layout.nodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(layout.edges);

    const onNodesChange: OnNodesChange = useCallback(
        (changes) => {
            onNodesChangeBase(changes);
            for (const change of changes) {
                if (
                    change.type === "dimensions" &&
                    change.dimensions?.width &&
                    change.dimensions?.height
                ) {
                    measuredDimensionsRef.current.set(
                        change.id,
                        change.dimensions,
                    );
                }
            }
        },
        [onNodesChangeBase],
    );

    useEffect(() => {
        if (!activeWorkflow) return;
        const stepSummaries = executionState
            ? deriveStepSummaries(executionState)
            : undefined;
        const diagnosticsByStep = new Map<string, ValidatorDiagnostic[]>();
        for (const d of activeDiagnostics) {
            if (
                !d.path ||
                d.path[0] !== "steps" ||
                typeof d.path[1] !== "number"
            )
                continue;
            const stepId = activeWorkflow.steps[d.path[1] as number]?.id;
            if (stepId) {
                const existing = diagnosticsByStep.get(stepId) ?? [];
                existing.push(d);
                diagnosticsByStep.set(stepId, existing);
            }
        }
        setNodes((prev) =>
            prev.map((n) => {
                const data = n.data as Record<string, unknown> | undefined;
                if (!data?.step) return n;
                const stepId = (data.step as { id: string }).id;
                return {
                    ...n,
                    data: {
                        ...data,
                        diagnostics: diagnosticsByStep.get(stepId) ?? [],
                        executionSummary: stepSummaries?.get(stepId),
                        pathSequenceIndexes: pathSequenceIndexes.get(stepId),
                        paused,
                    },
                };
            }),
        );
    }, [
        activeDiagnostics,
        executionState,
        paused,
        activeWorkflow,
        pathSequenceIndexes,
        setNodes,
    ]);

    // One-time re-layout with real DOM measurements. Depends on `nodes` so it
    // re-fires when React Flow processes dimension events. Reads from
    // measuredDimensionsRef (not node.measured) because buildLayout pre-sets
    // measured with heuristic estimates that would trigger a false positive.
    useEffect(() => {
        if (initialMeasureDoneRef.current) return;
        if (nodes.length === 0 || measuredDimensionsRef.current.size === 0)
            return;
        initialMeasureDoneRef.current = true;
        const dims = measuredDimensionsRef.current;
        if (isEditing) {
            const fresh = buildEditableLayout(
                activeWorkflow,
                activeDiagnostics,
                undefined,
                positionOverridesRef.current,
                dimensionOverridesRef.current,
                dims,
                direction,
            );
            setNodes(fresh.nodes);
            setEdges(fresh.edges);
        } else {
            const fresh = buildLayout(
                activeWorkflow,
                activeDiagnostics,
                executionState,
                dims,
                paused,
                direction,
                pathSequenceIndexes,
            );
            setNodes(fresh.nodes);
            setEdges(fresh.edges);
        }
        setLayoutReady(true);
    }, [
        nodes,
        activeWorkflow,
        activeDiagnostics,
        executionState,
        isEditing,
        paused,
        direction,
        pathSequenceIndexes,
        setNodes,
        setEdges,
    ]);

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
                const freshDims =
                    measuredDimensionsRef.current.size > 0
                        ? measuredDimensionsRef.current
                        : undefined;
                const fresh = buildLayout(
                    activeWorkflow,
                    activeDiagnostics,
                    executionState,
                    freshDims,
                    paused,
                    direction,
                    pathSequenceIndexes,
                );
                setNodes(fresh.nodes);
                setEdges(fresh.edges);
            } else if (viewStructureChanged) {
                // Workflow graph shape changed — full layout reset needed
                measuredDimensionsRef.current.clear();
                initialMeasureDoneRef.current = false;
                setNodes(layout.nodes);
                setEdges(layout.edges);
            } else {
                // Structure is the same — only update node data (execution summaries)
                // and edge data (executed flags) to avoid position recalculation flicker
                const dataMap = new Map(
                    layout.nodes.map((n) => [n.id, n.data]),
                );
                setNodes((prev) =>
                    prev.map((n) => {
                        const newData = dataMap.get(n.id);
                        return newData ? { ...n, data: newData } : n;
                    }),
                );
                const edgeDataMap = new Map(
                    layout.edges.map((e) => [e.id, e.data]),
                );
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

        if (skipNextLayoutEffectRef.current) {
            skipNextLayoutEffectRef.current = false;
            return;
        }

        if (structureChanged) {
            // Prune overrides/measurements for removed nodes, but keep them for
            // nodes that still exist so user-dragged positions survive incremental
            // edits (e.g. adding a single step).
            const currentNodeIds = new Set(layout.nodes.map((n) => n.id));
            for (const id of positionOverridesRef.current.keys()) {
                if (!currentNodeIds.has(id))
                    positionOverridesRef.current.delete(id);
            }
            for (const id of dimensionOverridesRef.current.keys()) {
                if (!currentNodeIds.has(id))
                    dimensionOverridesRef.current.delete(id);
            }
            for (const id of measuredDimensionsRef.current.keys()) {
                if (!currentNodeIds.has(id))
                    measuredDimensionsRef.current.delete(id);
            }
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
        direction,
        pathSequenceIndexes,
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
        selectedExecutionSummary,
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

    const selectedStepBindings = useMemo<ScopeBinding[]>(() => {
        if (!selectedStep || !activeWorkflow) return [];
        const stubTools = tools ?? buildStubTools(toolSchemas);
        try {
            return scopeAt(
                activeWorkflow,
                selectedStep.id,
                stubTools as ToolSet,
            );
        } catch {
            return [];
        }
    }, [selectedStep, activeWorkflow, tools, toolSchemas]);

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
                    (parent.style?.width as number) ??
                    parent.measured?.width ??
                    0;
                const parentH =
                    (parent.style?.height as number) ??
                    parent.measured?.height ??
                    0;

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
                            data: {
                                ...data,
                                groupWidth: newW,
                                groupHeight: newH,
                            },
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
            const existingIds = new Set(
                activeWorkflow?.steps.map((s) => s.id) ?? [],
            );
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
    const skipNextLayoutEffectRef = useRef(false);
    const handleAutoLayout = useCallback(() => {
        positionOverridesRef.current.clear();
        dimensionOverridesRef.current.clear();
        const dims =
            measuredDimensionsRef.current.size > 0
                ? measuredDimensionsRef.current
                : undefined;
        const fresh = buildEditableLayout(
            activeWorkflow,
            activeDiagnostics,
            undefined,
            undefined,
            undefined,
            dims,
            direction,
        );
        // Prevent the big layout useEffect from overwriting with a data-only
        // update on the next render — auto-layout's result is authoritative.
        skipNextLayoutEffectRef.current = true;
        setNodes(fresh.nodes);
        setEdges(fresh.edges);
    }, [activeWorkflow, activeDiagnostics, setNodes, setEdges, direction]);

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
        <ToolSchemasContext.Provider value={toolSchemas}>
            <EditContext.Provider value={editContextValue}>
                <div
                    role="application"
                    className="flex h-full w-full min-h-0 overflow-hidden"
                    onKeyDown={onKeyDown}
                    tabIndex={-1}
                >
                    <div
                        ref={containerRef}
                        className="flex-1 relative"
                        style={
                            layoutReady ? undefined : { visibility: "hidden" }
                        }
                    >
                        <ReactFlow
                            colorMode={isDark ? "dark" : "light"}
                            nodes={nodes}
                            edges={edges}
                            onNodesChange={onNodesChange}
                            onEdgesChange={onEdgesChange}
                            onNodeClick={onNodeClick}
                            onPaneClick={onPaneClick}
                            onConnect={isEditing ? onConnect : undefined}
                            onNodeDrag={isEditing ? onNodeDrag : undefined}
                            onNodeDragStop={
                                isEditing ? onNodeDragStop : undefined
                            }
                            onPaneContextMenu={
                                isEditing ? onPaneContextMenu : undefined
                            }
                            onNodeContextMenu={
                                isEditing ? onNodeContextMenu : undefined
                            }
                            onDragOver={isEditing ? onDragOver : undefined}
                            onDrop={isEditing ? onDrop : undefined}
                            nodeTypes={nodeTypes}
                            edgeTypes={edgeTypes}
                            fitView
                            fitViewOptions={FIT_VIEW_OPTIONS}
                            minZoom={0.1}
                            nodesDraggable={isEditing}
                            nodesConnectable={isEditing}
                            defaultEdgeOptions={{
                                type: "workflow",
                            }}
                            proOptions={{ hideAttribution: true }}
                        >
                            <HandlePositionUpdater direction={direction} />
                            <Background size={3} />
                            <Controls showInteractive={false} />
                            {showMinimap && (
                                <MiniMap
                                    nodeStrokeWidth={2}
                                    pannable
                                    zoomable
                                    style={{
                                        width: effectiveMinimapWidth,
                                        height: effectiveMinimapHeight,
                                    }}
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
                                <StepPalette
                                    onAddStep={(type) => handleAddStep(type)}
                                    features={features}
                                />
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
                                features={features}
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
                                onSetInitialStep={
                                    contextMenu.nodeId
                                        ? (id) => {
                                              updateWorkflowMeta({
                                                  initialStepId: id,
                                              });
                                          }
                                        : undefined
                                }
                                isInitialStep={
                                    contextMenu.nodeId ===
                                    activeWorkflow?.initialStepId
                                }
                            />
                        )}
                        {isEditing && !activeWorkflow?.steps.length && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="text-muted-foreground text-sm bg-card/80 rounded-lg px-6 py-4 border border-border">
                                    Add a step from the palette or right-click
                                    to get started
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
                                diagnostics={activeDiagnostics.filter((d) => {
                                    if (
                                        !d.path ||
                                        d.path[0] !== "steps" ||
                                        typeof d.path[1] !== "number"
                                    )
                                        return false;
                                    return (
                                        activeWorkflow?.steps[
                                            d.path[1] as number
                                        ]?.id === selectedStep.id
                                    );
                                })}
                                workflowInputSchema={
                                    activeWorkflow?.inputSchema as
                                        | object
                                        | undefined
                                }
                                workflowOutputSchema={
                                    activeWorkflow?.outputSchema as
                                        | object
                                        | undefined
                                }
                                expressionBindings={selectedStepBindings}
                                onChange={(updates) =>
                                    updateStep(selectedStep.id, updates)
                                }
                                onWorkflowMetaChange={updateWorkflowMeta}
                                onClose={clearSelection}
                            />
                        ) : (
                            <StepDetailPanel
                                step={selectedStep}
                                diagnostics={activeDiagnostics.filter((d) => {
                                    if (
                                        !d.path ||
                                        d.path[0] !== "steps" ||
                                        typeof d.path[1] !== "number"
                                    )
                                        return false;
                                    return (
                                        activeWorkflow?.steps[
                                            d.path[1] as number
                                        ]?.id === selectedStep.id
                                    );
                                })}
                                executionSummary={selectedExecutionSummary}
                                executions={
                                    selectedExecutionSummary?.executions
                                }
                                onExecutionPathHover={setHighlightedExecutionId}
                                onExecutionPathLeave={() =>
                                    setHighlightedExecutionId(undefined)
                                }
                                workflowInputSchema={
                                    activeWorkflow?.inputSchema as
                                        | object
                                        | undefined
                                }
                                workflowOutputSchema={
                                    activeWorkflow?.outputSchema as
                                        | object
                                        | undefined
                                }
                                onClose={() => {
                                    setHighlightedExecutionId(undefined);
                                    clearSelection();
                                }}
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
        </ToolSchemasContext.Provider>
    );
}

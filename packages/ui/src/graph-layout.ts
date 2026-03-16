import dagre from "@dagrejs/dagre";
import type {
	Diagnostic,
	ExecutionState,
	WorkflowDefinition,
	WorkflowStep,
} from "@remoraflow/core";
import type { Edge, Node } from "@xyflow/react";
import {
	deriveStepSummaries,
	type StepExecutionSummary,
} from "./execution-state";

export interface StepNodeData {
	step: WorkflowStep;
	diagnostics: Diagnostic[];
	hasSourceEdge?: boolean;
	inputSchema?: object;
	outputSchema?: object;
	/** Execution summary for this step, when executionState is provided. */
	executionSummary?: StepExecutionSummary;
}

const NODE_WIDTH = 300;
const NODE_HEIGHT = 180;
const START_NODE_SIZE = 60;
const GROUP_HEADER_WIDTH = 280;
const GROUP_HEADER_HEIGHT = 80;
export const GROUP_PADDING = 30;
export const GROUP_HEADER = 40;

const START_NODE_ID = "__start__";

function getOrThrow<K, V>(map: Map<K, V>, key: K): V {
	const val = map.get(key);
	if (val === undefined) throw new Error(`Missing map key: ${String(key)}`);
	return val;
}

function stepNodeType(step: WorkflowStep): string | undefined {
	switch (step.type) {
		case "tool-call":
			return "toolCall";
		case "llm-prompt":
			return "llmPrompt";
		case "extract-data":
			return "extractData";
		case "switch-case":
			return "switchCase";
		case "for-each":
			return "forEach";
		case "start":
			return "startStep";
		case "end":
			return "end";
		case "sleep":
			return "sleep";
		case "wait-for-condition":
			return "waitForCondition";
		case "agent-loop":
			return "agentLoop";
	}
}

function renderExpression(
	expr:
		| { type: "literal"; value: unknown }
		| { type: "jmespath"; expression: string }
		| { type: "template"; template: string },
): string {
	if (expr.type === "literal") return JSON.stringify(expr.value);
	if (expr.type === "template") return expr.template;
	return expr.expression;
}

function nodeSize(
	_step: WorkflowStep,
	_workflow?: WorkflowDefinition,
): { w: number; h: number } {
	return { w: NODE_WIDTH, h: NODE_HEIGHT };
}

function collectChildSteps(
	step: WorkflowStep,
	stepMap: Map<string, WorkflowStep>,
): Set<string> {
	const children = new Set<string>();
	const continuation = step.nextStepId;

	const seeds: string[] = [];
	if (step.type === "for-each") {
		seeds.push(step.params.loopBodyStepId);
	} else if (step.type === "switch-case") {
		for (const c of step.params.cases) {
			seeds.push(c.branchBodyStepId);
		}
	} else if (step.type === "wait-for-condition") {
		seeds.push(step.params.conditionStepId);
	} else {
		return children;
	}

	const queue = [...seeds];
	while (queue.length > 0) {
		const id = queue.shift();
		if (id === undefined) continue;
		if (children.has(id) || id === continuation) continue;
		const s = stepMap.get(id);
		if (!s) continue;
		children.add(id);
		if (s.nextStepId) queue.push(s.nextStepId);
		if (s.type === "switch-case") {
			for (const c of s.params.cases) queue.push(c.branchBodyStepId);
		}
		if (s.type === "for-each") {
			queue.push(s.params.loopBodyStepId);
		}
		if (s.type === "wait-for-condition") {
			queue.push(s.params.conditionStepId);
		}
	}
	return children;
}

function buildParentMap(
	workflow: WorkflowDefinition,
	stepMap: Map<string, WorkflowStep>,
): Map<string, string> {
	const parentMap = new Map<string, string>();
	const allGroupChildren = new Map<string, Set<string>>();

	for (const step of workflow.steps) {
		if (
			step.type === "for-each" ||
			step.type === "switch-case" ||
			step.type === "wait-for-condition"
		) {
			allGroupChildren.set(step.id, collectChildSteps(step, stepMap));
		}
	}

	for (const [groupId, children] of allGroupChildren) {
		for (const childId of children) {
			const currentParent = parentMap.get(childId);
			if (!currentParent) {
				parentMap.set(childId, groupId);
			} else {
				const currentParentChildren = allGroupChildren.get(currentParent);
				if (currentParentChildren?.has(groupId)) {
					parentMap.set(childId, groupId);
				}
			}
		}
	}

	return parentMap;
}

function getDirectChildren(
	groupId: string,
	parentMap: Map<string, string>,
): Set<string> {
	const direct = new Set<string>();
	for (const [childId, pid] of parentMap) {
		if (pid === groupId) direct.add(childId);
	}
	return direct;
}

function groupProcessingOrder(
	groupIds: Set<string>,
	parentMap: Map<string, string>,
): string[] {
	const order: string[] = [];
	const visited = new Set<string>();

	function visit(id: string) {
		if (visited.has(id)) return;
		visited.add(id);
		for (const [childId, pid] of parentMap) {
			if (pid === id && groupIds.has(childId)) {
				visit(childId);
			}
		}
		order.push(id);
	}

	for (const id of groupIds) {
		visit(id);
	}
	return order;
}

function groupHeaderId(groupId: string): string {
	return `__header__${groupId}`;
}

function getNodeDimensions(
	nodeId: string,
	groupIds: Set<string>,
	computedSizes: Map<string, { w: number; h: number }>,
	stepMap: Map<string, WorkflowStep>,
	workflow?: WorkflowDefinition,
): { w: number; h: number } {
	if (groupIds.has(nodeId)) {
		return getOrThrow(computedSizes, nodeId);
	}
	return nodeSize(getOrThrow(stepMap, nodeId), workflow);
}

export function buildLayout(
	workflow: WorkflowDefinition | null,
	diagnostics: Diagnostic[] = [],
	executionState?: ExecutionState,
): { nodes: Node[]; edges: Edge[] } {
	if (!workflow || workflow.steps.length === 0) {
		return { nodes: [], edges: [] };
	}

	// --- Step 1: Build maps ---
	const stepSummaries = executionState
		? deriveStepSummaries(executionState)
		: undefined;
	const diagnosticsByStep = new Map<string, Diagnostic[]>();
	for (const d of diagnostics) {
		if (d.location.stepId) {
			const existing = diagnosticsByStep.get(d.location.stepId) ?? [];
			existing.push(d);
			diagnosticsByStep.set(d.location.stepId, existing);
		}
	}

	const stepMap = new Map<string, WorkflowStep>();
	for (const step of workflow.steps) {
		stepMap.set(step.id, step);
	}

	const parentMap = buildParentMap(workflow, stepMap);

	// --- Step 2: Identify groups ---
	const groupIds = new Set<string>();
	for (const step of workflow.steps) {
		if (
			step.type === "for-each" ||
			step.type === "switch-case" ||
			step.type === "wait-for-condition"
		) {
			const hasChildren = [...parentMap.values()].some(
				(pid) => pid === step.id,
			);
			if (hasChildren) groupIds.add(step.id);
		}
	}

	// --- Step 3: Compute group sizes bottom-up ---
	const processOrder = groupProcessingOrder(groupIds, parentMap);
	const computedSizes = new Map<string, { w: number; h: number }>();
	const groupChildPositions = new Map<
		string,
		Map<string, { x: number; y: number }>
	>();

	for (const groupId of processOrder) {
		const groupStep = getOrThrow(stepMap, groupId);
		const directChildren = getDirectChildren(groupId, parentMap);
		if (directChildren.size === 0) {
			groupIds.delete(groupId);
			continue;
		}

		const subG = new dagre.graphlib.Graph();
		subG.setGraph({ rankdir: "TB", ranksep: 60, nodesep: 40 });
		subG.setDefaultEdgeLabel(() => ({}));

		// Add a synthetic header node for this group
		const headerId = groupHeaderId(groupId);
		subG.setNode(headerId, {
			width: GROUP_HEADER_WIDTH,
			height: GROUP_HEADER_HEIGHT,
		});

		// Add child nodes
		for (const childId of directChildren) {
			const { w, h } = getNodeDimensions(
				childId,
				groupIds,
				computedSizes,
				stepMap,
				workflow,
			);
			subG.setNode(childId, { width: w, height: h });
		}

		// Edges from header to entry points
		if (groupStep.type === "switch-case") {
			for (const c of groupStep.params.cases) {
				if (directChildren.has(c.branchBodyStepId)) {
					subG.setEdge(headerId, c.branchBodyStepId);
				}
			}
		} else if (groupStep.type === "for-each") {
			if (directChildren.has(groupStep.params.loopBodyStepId)) {
				subG.setEdge(headerId, groupStep.params.loopBodyStepId);
			}
		} else if (groupStep.type === "wait-for-condition") {
			if (directChildren.has(groupStep.params.conditionStepId)) {
				subG.setEdge(headerId, groupStep.params.conditionStepId);
			}
		}

		// Edges between direct children
		for (const childId of directChildren) {
			const step = getOrThrow(stepMap, childId);
			if (step.nextStepId && directChildren.has(step.nextStepId)) {
				subG.setEdge(childId, step.nextStepId);
			}
			if (step.type === "switch-case") {
				for (const c of step.params.cases) {
					if (directChildren.has(c.branchBodyStepId)) {
						subG.setEdge(childId, c.branchBodyStepId);
					}
				}
			}
			if (step.type === "for-each") {
				if (directChildren.has(step.params.loopBodyStepId)) {
					subG.setEdge(childId, step.params.loopBodyStepId);
				}
			}
			if (step.type === "wait-for-condition") {
				if (directChildren.has(step.params.conditionStepId)) {
					subG.setEdge(childId, step.params.conditionStepId);
				}
			}
		}

		dagre.layout(subG);

		let minX = Number.POSITIVE_INFINITY;
		let minY = Number.POSITIVE_INFINITY;
		let maxX = Number.NEGATIVE_INFINITY;
		let maxY = Number.NEGATIVE_INFINITY;

		const allSubNodes = new Set(directChildren);
		allSubNodes.add(headerId);

		const rawPositions = new Map<string, { x: number; y: number }>();
		for (const nodeId of allSubNodes) {
			const pos = subG.node(nodeId);
			let w: number;
			let h: number;
			if (nodeId === headerId) {
				w = GROUP_HEADER_WIDTH;
				h = GROUP_HEADER_HEIGHT;
			} else {
				const dims = getNodeDimensions(
					nodeId,
					groupIds,
					computedSizes,
					stepMap,
					workflow,
				);
				w = dims.w;
				h = dims.h;
			}
			const x = pos.x - w / 2;
			const y = pos.y - h / 2;
			rawPositions.set(nodeId, { x, y });
			minX = Math.min(minX, x);
			minY = Math.min(minY, y);
			maxX = Math.max(maxX, x + w);
			maxY = Math.max(maxY, y + h);
		}

		const positions = new Map<string, { x: number; y: number }>();
		for (const [nodeId, pos] of rawPositions) {
			positions.set(nodeId, {
				x: pos.x - minX + GROUP_PADDING,
				y: pos.y - minY + GROUP_HEADER,
			});
		}
		groupChildPositions.set(groupId, positions);

		const contentWidth = maxX - minX;
		const contentHeight = maxY - minY;
		computedSizes.set(groupId, {
			w: contentWidth + GROUP_PADDING * 2,
			h: contentHeight + GROUP_HEADER + GROUP_PADDING,
		});
	}

	// --- Step 4: Top-level dagre layout ---
	const topG = new dagre.graphlib.Graph();
	topG.setGraph({ rankdir: "TB", ranksep: 80, nodesep: 60 });
	topG.setDefaultEdgeLabel(() => ({}));

	// Start node — skip pseudo-node when initialStepId is a "start" step
	const initialStep = stepMap.get(workflow.initialStepId);
	const hasStartStep = initialStep?.type === "start";

	if (!hasStartStep) {
		topG.setNode(START_NODE_ID, {
			width: START_NODE_SIZE,
			height: START_NODE_SIZE,
		});
	}

	const topLevelStepIds: string[] = [];
	for (const step of workflow.steps) {
		if (!parentMap.has(step.id)) {
			topLevelStepIds.push(step.id);
			const { w, h } = getNodeDimensions(
				step.id,
				groupIds,
				computedSizes,
				stepMap,
				workflow,
			);
			topG.setNode(step.id, { width: w, height: h });
		}
	}

	// Start → initial step
	if (!hasStartStep) {
		topG.setEdge(START_NODE_ID, workflow.initialStepId);
	}

	const topLevelSet = new Set(topLevelStepIds);
	for (const stepId of topLevelStepIds) {
		const step = getOrThrow(stepMap, stepId);
		if (step.nextStepId && topLevelSet.has(step.nextStepId)) {
			topG.setEdge(stepId, step.nextStepId);
		}
		if (step.type === "switch-case") {
			for (const c of step.params.cases) {
				if (topLevelSet.has(c.branchBodyStepId)) {
					topG.setEdge(stepId, c.branchBodyStepId);
				}
			}
		}
		if (step.type === "for-each") {
			if (topLevelSet.has(step.params.loopBodyStepId)) {
				topG.setEdge(stepId, step.params.loopBodyStepId);
			}
		}
		if (step.type === "wait-for-condition") {
			if (topLevelSet.has(step.params.conditionStepId)) {
				topG.setEdge(stepId, step.params.conditionStepId);
			}
		}
	}

	dagre.layout(topG);

	const topLevelPositions = new Map<string, { x: number; y: number }>();

	if (!hasStartStep) {
		const startPos = topG.node(START_NODE_ID);
		topLevelPositions.set(START_NODE_ID, {
			x: startPos.x - START_NODE_SIZE / 2,
			y: startPos.y - START_NODE_SIZE / 2,
		});
	}

	for (const stepId of topLevelStepIds) {
		const pos = topG.node(stepId);
		const { w, h } = getNodeDimensions(
			stepId,
			groupIds,
			computedSizes,
			stepMap,
			workflow,
		);
		topLevelPositions.set(stepId, {
			x: pos.x - w / 2,
			y: pos.y - h / 2,
		});
	}

	// --- Step 5: Build React Flow nodes ---
	const nodes: Node[] = [];

	// Start pseudo-node (only when no explicit start step exists)
	if (!hasStartStep) {
		const startNodePos = getOrThrow(topLevelPositions, START_NODE_ID);
		nodes.push({
			id: START_NODE_ID,
			type: "start",
			position: startNodePos,
			data: {},
			selectable: false,
		});
	}

	function addNodesForContext(
		nodeIds: Iterable<string>,
		getPosition: (id: string) => { x: number; y: number },
		parentId?: string,
	) {
		const groups: string[] = [];
		const headers: string[] = [];
		const nonGroups: string[] = [];
		for (const id of nodeIds) {
			if (groupIds.has(id)) groups.push(id);
			else if (id.startsWith("__header__")) headers.push(id);
			else nonGroups.push(id);
		}

		for (const id of groups) {
			const step = getOrThrow(stepMap, id);
			const pos = getPosition(id);
			const size = getOrThrow(computedSizes, id);

			nodes.push({
				id,
				type: stepNodeType(step),
				position: pos,
				data: {
					step,
					diagnostics: diagnosticsByStep.get(id) ?? [],
					isGroup: true,
					groupWidth: size.w,
					groupHeight: size.h,
					...(step.nextStepId ? { hasSourceEdge: true as const } : {}),
					executionSummary: stepSummaries?.get(id),
				},
				style: { width: size.w, height: size.h },
				...(parentId ? { parentId, extent: "parent" as const } : {}),
			});

			const childPositions = getOrThrow(groupChildPositions, id);
			addNodesForContext(
				childPositions.keys(),
				(childId) => getOrThrow(childPositions, childId),
				id,
			);
		}

		for (const id of headers) {
			const pos = getPosition(id);
			const gid = id.replace("__header__", "");
			const step = getOrThrow(stepMap, gid);

			const summary = stepSummaries?.get(gid);
			const resolvedInputs = summary?.latestResolvedInputs as
				| Record<string, unknown>
				| undefined;

			if (step.type === "switch-case") {
				nodes.push({
					id,
					type: "groupHeader",
					position: pos,
					data: {
						variant: "switch",
						description: step.description,
						expression: renderExpression(step.params.switchOn),
						resolvedExpression: resolvedInputs?.switchOn,
						step,
						diagnostics: diagnosticsByStep.get(gid) ?? [],
					},
					...(parentId ? { parentId, extent: "parent" as const } : {}),
				});
			} else if (step.type === "for-each") {
				nodes.push({
					id,
					type: "groupHeader",
					position: pos,
					data: {
						variant: "loop",
						description: step.description,
						target: renderExpression(step.params.target),
						resolvedTarget: resolvedInputs?.target,
						itemName: step.params.itemName,
						step,
						diagnostics: diagnosticsByStep.get(gid) ?? [],
					},
					...(parentId ? { parentId, extent: "parent" as const } : {}),
				});
			} else if (step.type === "wait-for-condition") {
				nodes.push({
					id,
					type: "groupHeader",
					position: pos,
					data: {
						variant: "condition",
						description: step.description,
						condition: renderExpression(step.params.condition),
					},
					...(parentId ? { parentId, extent: "parent" as const } : {}),
				});
			}
		}

		for (const id of nonGroups) {
			const step = getOrThrow(stepMap, id);
			const pos = getPosition(id);

			const nodeData: Record<string, unknown> = {
				step,
				diagnostics: diagnosticsByStep.get(id) ?? [],
				...(step.nextStepId ? { hasSourceEdge: true as const } : {}),
				executionSummary: stepSummaries?.get(id),
			};
			if (step.type === "start" && workflow?.inputSchema) {
				nodeData.inputSchema = workflow.inputSchema;
			}
			if (step.type === "end" && workflow?.outputSchema) {
				nodeData.outputSchema = workflow.outputSchema;
			}

			nodes.push({
				id,
				type: stepNodeType(step),
				position: pos,
				data: nodeData,
				...(parentId ? { parentId, extent: "parent" as const } : {}),
			});
		}
	}

	addNodesForContext(topLevelStepIds, (id) =>
		getOrThrow(topLevelPositions, id),
	);

	// --- Step 6: Build edges ---
	const edges: Edge[] = [];
	const hasExecState = !!stepSummaries;

	function isStepExecuted(stepId: string): boolean {
		const s = stepSummaries?.get(stepId);
		return s?.status === "completed" || s?.status === "running";
	}

	// Start → initial step (only when no explicit start step exists)
	if (!hasStartStep) {
		edges.push({
			id: `${START_NODE_ID}->${workflow.initialStepId}`,
			source: START_NODE_ID,
			target: workflow.initialStepId,
			type: "workflow",
			data: {
				edgeKind: "sequential",
				executed: hasExecState && isStepExecuted(workflow.initialStepId),
				hasExecutionState: hasExecState,
			},
		});
	}

	for (const step of workflow.steps) {
		if (step.type === "switch-case") {
			if (groupIds.has(step.id)) {
				const headerId = groupHeaderId(step.id);
				for (const c of step.params.cases) {
					const label =
						c.value.type === "default" ? "default" : renderExpression(c.value);
					edges.push({
						id: `${headerId}->${c.branchBodyStepId}`,
						source: headerId,
						target: c.branchBodyStepId,
						label,
						type: "workflow",
						data: {
							edgeKind: "branch",
							executed: hasExecState && isStepExecuted(c.branchBodyStepId),
							hasExecutionState: hasExecState,
						},
					});
				}
			}
			if (step.nextStepId) {
				edges.push({
					id: `${step.id}->${step.nextStepId}`,
					source: step.id,
					target: step.nextStepId,
					type: "workflow",
					data: {
						edgeKind: "sequential",
						executed: hasExecState && isStepExecuted(step.nextStepId),
						hasExecutionState: hasExecState,
					},
				});
			}
		} else if (step.type === "for-each") {
			if (groupIds.has(step.id)) {
				const headerId = groupHeaderId(step.id);
				edges.push({
					id: `${headerId}->${step.params.loopBodyStepId}`,
					source: headerId,
					target: step.params.loopBodyStepId,
					type: "workflow",
					data: {
						edgeKind: "sequential",
						executed:
							hasExecState && isStepExecuted(step.params.loopBodyStepId),
						hasExecutionState: hasExecState,
					},
				});
			}
			if (step.nextStepId) {
				edges.push({
					id: `${step.id}->${step.nextStepId}`,
					source: step.id,
					target: step.nextStepId,
					type: "workflow",
					data: {
						edgeKind: "sequential",
						executed: hasExecState && isStepExecuted(step.nextStepId),
						hasExecutionState: hasExecState,
					},
				});
			}
		} else if (step.type === "wait-for-condition") {
			if (groupIds.has(step.id)) {
				const headerId = groupHeaderId(step.id);
				edges.push({
					id: `${headerId}->${step.params.conditionStepId}`,
					source: headerId,
					target: step.params.conditionStepId,
					type: "workflow",
					data: { edgeKind: "sequential" },
				});
			}
			if (step.nextStepId) {
				edges.push({
					id: `${step.id}->${step.nextStepId}`,
					source: step.id,
					target: step.nextStepId,
					type: "workflow",
					data: { edgeKind: "sequential" },
				});
			}
		} else if (step.nextStepId) {
			edges.push({
				id: `${step.id}->${step.nextStepId}`,
				source: step.id,
				target: step.nextStepId,
				type: "workflow",
				data: {
					edgeKind: "sequential",
					executed: hasExecState && isStepExecuted(step.nextStepId),
					hasExecutionState: hasExecState,
				},
			});
		}
	}

	return { nodes, edges };
}

const EMPTY_GROUP_WIDTH = GROUP_HEADER_WIDTH + GROUP_PADDING * 2;
const EMPTY_GROUP_HEIGHT = GROUP_HEADER_HEIGHT + GROUP_HEADER + GROUP_PADDING;
const GROUP_STEP_TYPES = new Set([
	"for-each",
	"switch-case",
	"wait-for-condition",
]);

function buildGroupHeaderData(
	step: WorkflowStep,
	diagnostics: Diagnostic[],
): Record<string, unknown> {
	const stepDiags = diagnostics.filter((d) => d.location.stepId === step.id);

	if (step.type === "switch-case") {
		return {
			variant: "switch",
			description: step.description,
			expression: renderExpression(step.params.switchOn),
			step,
			diagnostics: stepDiags,
		};
	}
	if (step.type === "for-each") {
		return {
			variant: "loop",
			description: step.description,
			target: renderExpression(step.params.target),
			itemName: step.params.itemName,
			step,
			diagnostics: stepDiags,
		};
	}
	if (step.type === "wait-for-condition") {
		return {
			variant: "condition",
			description: step.description,
			condition: renderExpression(step.params.condition),
		};
	}
	return {};
}

/**
 * Build layout for edit mode, applying user position overrides on top of dagre layout.
 * Nodes with overrides get their dagre-computed position replaced.
 */
export function buildEditableLayout(
	workflow: WorkflowDefinition | null,
	diagnostics: Diagnostic[] = [],
	executionState?: ExecutionState,
	positionOverrides?: Map<string, { x: number; y: number }>,
	dimensionOverrides?: Map<string, { width: number; height: number }>,
): { nodes: Node[]; edges: Edge[] } {
	const result = buildLayout(workflow, diagnostics, executionState);

	// Filter out the pseudo __start__ node in edit mode — users create explicit start/end steps instead.
	// Keep __header__* nodes since those are group headers for for-each/switch-case/wait-for-condition.
	let nodes = result.nodes.filter((n) => n.id !== "__start__");
	const edges = result.edges.filter(
		(e) => e.source !== "__start__" && e.target !== "__start__",
	);

	// In edit mode, group-type steps without children should still render as
	// group containers with a header node so users can connect children to them.
	if (workflow) {
		const existingGroupIds = new Set(
			nodes
				.filter((n) => (n.data as Record<string, unknown>)?.isGroup === true)
				.map((n) => n.id),
		);

		for (const step of workflow.steps) {
			if (!GROUP_STEP_TYPES.has(step.type)) continue;
			if (existingGroupIds.has(step.id)) continue;

			const flatNodeIdx = nodes.findIndex((n) => n.id === step.id);
			if (flatNodeIdx === -1) continue;
			const flatNode = nodes[flatNodeIdx] as Node;

			// Replace flat node with group container
			nodes[flatNodeIdx] = {
				...flatNode,
				data: {
					...(flatNode.data as Record<string, unknown>),
					isGroup: true,
					groupWidth: EMPTY_GROUP_WIDTH,
					groupHeight: EMPTY_GROUP_HEIGHT,
				},
				style: { width: EMPTY_GROUP_WIDTH, height: EMPTY_GROUP_HEIGHT },
			};

			// Inject header node as child
			nodes.push({
				id: groupHeaderId(step.id),
				type: "groupHeader",
				position: {
					x: (EMPTY_GROUP_WIDTH - GROUP_HEADER_WIDTH) / 2,
					y: GROUP_HEADER,
				},
				data: buildGroupHeaderData(step, diagnostics),
				parentId: step.id,
				extent: "parent" as const,
			});
		}
	}

	// In edit mode, remove extent constraint so children can be dragged freely
	// (the parent group will expand to fit via onNodeDrag in the viewer).
	nodes = nodes.map((node) => {
		if (node.parentId && node.extent) {
			const { extent, ...rest } = node;
			return rest;
		}
		return node;
	});

	if (positionOverrides && positionOverrides.size > 0) {
		nodes = nodes.map((node) => {
			const override = positionOverrides.get(node.id);
			if (override && !node.parentId) {
				return { ...node, position: override };
			}
			return node;
		});
	}

	if (dimensionOverrides && dimensionOverrides.size > 0) {
		nodes = nodes.map((node) => {
			const dims = dimensionOverrides.get(node.id);
			if (dims) {
				const data = node.data as Record<string, unknown>;
				return {
					...node,
					style: { ...node.style, width: dims.width, height: dims.height },
					data: { ...data, groupWidth: dims.width, groupHeight: dims.height },
				};
			}
			return node;
		});
	}

	return { nodes, edges };
}

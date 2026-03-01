import dagre from "@dagrejs/dagre";
import type { Edge, Node } from "@xyflow/react";
import type { WorkflowDefinition, WorkflowStep } from "../types";
import type { Diagnostic } from "../compiler/types";

export interface StepNodeData {
	step: WorkflowStep;
	diagnostics: Diagnostic[];
	hasSourceEdge?: boolean;
}

const NODE_WIDTH = 300;
const NODE_HEIGHT = 180;
const END_NODE_SIZE = 60;
const START_NODE_SIZE = 60;
const GROUP_HEADER_WIDTH = 280;
const GROUP_HEADER_HEIGHT = 80;
const GROUP_PADDING = 30;
const GROUP_HEADER = 40;

const START_NODE_ID = "__start__";

function stepNodeType(step: WorkflowStep): string {
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
		case "end":
			return "end";
	}
}

function renderExpression(
	expr:
		| { type: "literal"; value: unknown }
		| { type: "jmespath"; expression: string },
): string {
	if (expr.type === "literal") return JSON.stringify(expr.value);
	return expr.expression;
}

function nodeSize(step: WorkflowStep): { w: number; h: number } {
	return step.type === "end"
		? { w: END_NODE_SIZE, h: END_NODE_SIZE }
		: { w: NODE_WIDTH, h: NODE_HEIGHT };
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
	} else {
		return children;
	}

	const queue = [...seeds];
	while (queue.length > 0) {
		const id = queue.shift()!;
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
		if (step.type === "for-each" || step.type === "switch-case") {
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

export function buildLayout(
	workflow: WorkflowDefinition,
	diagnostics: Diagnostic[] = [],
): { nodes: Node[]; edges: Edge[] } {
	// --- Step 1: Build maps ---
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
		if (step.type === "for-each" || step.type === "switch-case") {
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
		const groupStep = stepMap.get(groupId)!;
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
			let w: number;
			let h: number;
			if (groupIds.has(childId)) {
				const s = computedSizes.get(childId)!;
				w = s.w;
				h = s.h;
			} else {
				const s = nodeSize(stepMap.get(childId)!);
				w = s.w;
				h = s.h;
			}
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
		}

		// Edges between direct children
		for (const childId of directChildren) {
			const step = stepMap.get(childId)!;
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
		}

		dagre.layout(subG);

		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;

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
			} else if (groupIds.has(nodeId)) {
				const s = computedSizes.get(nodeId)!;
				w = s.w;
				h = s.h;
			} else {
				const s = nodeSize(stepMap.get(nodeId)!);
				w = s.w;
				h = s.h;
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

	// Start node
	topG.setNode(START_NODE_ID, {
		width: START_NODE_SIZE,
		height: START_NODE_SIZE,
	});

	const topLevelStepIds: string[] = [];
	for (const step of workflow.steps) {
		if (!parentMap.has(step.id)) {
			topLevelStepIds.push(step.id);
			let w: number;
			let h: number;
			if (groupIds.has(step.id)) {
				const s = computedSizes.get(step.id)!;
				w = s.w;
				h = s.h;
			} else {
				const s = nodeSize(step);
				w = s.w;
				h = s.h;
			}
			topG.setNode(step.id, { width: w, height: h });
		}
	}

	// Start → initial step
	topG.setEdge(START_NODE_ID, workflow.initialStepId);

	const topLevelSet = new Set(topLevelStepIds);
	for (const stepId of topLevelStepIds) {
		const step = stepMap.get(stepId)!;
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
	}

	dagre.layout(topG);

	const topLevelPositions = new Map<string, { x: number; y: number }>();

	const startPos = topG.node(START_NODE_ID);
	topLevelPositions.set(START_NODE_ID, {
		x: startPos.x - START_NODE_SIZE / 2,
		y: startPos.y - START_NODE_SIZE / 2,
	});

	for (const stepId of topLevelStepIds) {
		const pos = topG.node(stepId);
		let w: number;
		let h: number;
		if (groupIds.has(stepId)) {
			const s = computedSizes.get(stepId)!;
			w = s.w;
			h = s.h;
		} else {
			const s = nodeSize(stepMap.get(stepId)!);
			w = s.w;
			h = s.h;
		}
		topLevelPositions.set(stepId, {
			x: pos.x - w / 2,
			y: pos.y - h / 2,
		});
	}

	// --- Step 5: Build React Flow nodes ---
	const nodes: Node[] = [];

	// Start node
	nodes.push({
		id: START_NODE_ID,
		type: "start",
		position: topLevelPositions.get(START_NODE_ID)!,
		data: {},
		selectable: false,
	});

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
			const step = stepMap.get(id)!;
			const pos = getPosition(id);
			const size = computedSizes.get(id)!;

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
					hasSourceEdge: !!step.nextStepId,
				},
				style: { width: size.w, height: size.h },
				...(parentId
					? { parentId, extent: "parent" as const }
					: {}),
			});

			const childPositions = groupChildPositions.get(id)!;
			addNodesForContext(
				childPositions.keys(),
				(childId) => childPositions.get(childId)!,
				id,
			);
		}

		for (const id of headers) {
			const pos = getPosition(id);
			const gid = id.replace("__header__", "");
			const step = stepMap.get(gid)!;

			if (step.type === "switch-case") {
				nodes.push({
					id,
					type: "groupHeader",
					position: pos,
					data: {
						variant: "switch",
						description: step.description,
						expression: renderExpression(step.params.switchOn),
					},
					...(parentId
						? { parentId, extent: "parent" as const }
						: {}),
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
						itemName: step.params.itemName,
					},
					...(parentId
						? { parentId, extent: "parent" as const }
						: {}),
				});
			}
		}

		for (const id of nonGroups) {
			const step = stepMap.get(id)!;
			const pos = getPosition(id);

			nodes.push({
				id,
				type: stepNodeType(step),
				position: pos,
				data: {
					step,
					diagnostics: diagnosticsByStep.get(id) ?? [],
					hasSourceEdge: !!step.nextStepId,
				},
				...(parentId
					? { parentId, extent: "parent" as const }
					: {}),
			});
		}
	}

	addNodesForContext(
		topLevelStepIds,
		(id) => topLevelPositions.get(id)!,
	);

	// --- Step 6: Build edges ---
	const edges: Edge[] = [];

	// Start → initial step
	edges.push({
		id: `${START_NODE_ID}->${workflow.initialStepId}`,
		source: START_NODE_ID,
		target: workflow.initialStepId,
		type: "workflow",
		data: { edgeKind: "sequential" },
	});

	for (const step of workflow.steps) {
		if (step.type === "switch-case") {
			if (groupIds.has(step.id)) {
				const headerId = groupHeaderId(step.id);
				for (const c of step.params.cases) {
					const label =
						c.value.type === "default"
							? "default"
							: renderExpression(c.value);
					edges.push({
						id: `${headerId}->${c.branchBodyStepId}`,
						source: headerId,
						target: c.branchBodyStepId,
						label,
						type: "workflow",
						data: { edgeKind: "branch" },
					});
				}
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
		} else if (step.type === "for-each") {
			if (groupIds.has(step.id)) {
				const headerId = groupHeaderId(step.id);
				edges.push({
					id: `${headerId}->${step.params.loopBodyStepId}`,
					source: headerId,
					target: step.params.loopBodyStepId,
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
				data: { edgeKind: "sequential" },
			});
		}
	}

	return { nodes, edges };
}

import type { WorkflowStep } from "../../types";

export function buildStepIndex(
	steps: WorkflowStep[],
): { index: Map<string, WorkflowStep>; duplicates: string[] } {
	const index = new Map<string, WorkflowStep>();
	const duplicates: string[] = [];

	for (const step of steps) {
		if (index.has(step.id)) {
			duplicates.push(step.id);
		} else {
			index.set(step.id, step);
		}
	}

	return { index, duplicates };
}

export function computeSuccessors(
	stepIndex: Map<string, WorkflowStep>,
): Map<string, Set<string>> {
	const successors = new Map<string, Set<string>>();

	for (const [id, step] of stepIndex) {
		const succs = new Set<string>();

		if (step.nextStepId) {
			succs.add(step.nextStepId);
		}

		if (step.type === "switch-case") {
			for (const c of step.params.cases) {
				succs.add(c.branchBodyStepId);
			}
		}

		if (step.type === "for-each") {
			succs.add(step.params.loopBodyStepId);
		}

		successors.set(id, succs);
	}

	return successors;
}

export function computeReachability(
	initialStepId: string,
	successors: Map<string, Set<string>>,
): Set<string> {
	const reachable = new Set<string>();
	const queue = [initialStepId];

	while (queue.length > 0) {
		const current = queue.shift();
		if (current === undefined) break;
		if (reachable.has(current)) continue;
		reachable.add(current);

		const succs = successors.get(current);
		if (succs) {
			for (const s of succs) {
				if (!reachable.has(s)) {
					queue.push(s);
				}
			}
		}
	}

	return reachable;
}

/**
 * Detect cycles using DFS with white/gray/black coloring.
 * Returns arrays of step IDs forming each detected cycle.
 */
export function detectCycles(
	stepIndex: Map<string, WorkflowStep>,
	successors: Map<string, Set<string>>,
): string[][] {
	const WHITE = 0;
	const GRAY = 1;
	const BLACK = 2;

	const color = new Map<string, number>();
	for (const id of stepIndex.keys()) {
		color.set(id, WHITE);
	}

	const cycles: string[][] = [];
	const path: string[] = [];

	function dfs(node: string) {
		if (!stepIndex.has(node)) return;

		color.set(node, GRAY);
		path.push(node);

		const succs = successors.get(node);
		if (succs) {
			for (const next of succs) {
				if (!stepIndex.has(next)) continue;

				const c = color.get(next);
				if (c === undefined) continue;
				if (c === GRAY) {
					// Found a cycle — extract the cycle from the path
					const cycleStart = path.indexOf(next);
					cycles.push(path.slice(cycleStart));
				} else if (c === WHITE) {
					dfs(next);
				}
			}
		}

		path.pop();
		color.set(node, BLACK);
	}

	for (const id of stepIndex.keys()) {
		if (color.get(id) === WHITE) {
			dfs(id);
		}
	}

	return cycles;
}

/**
 * Compute the set of predecessor step IDs for each step.
 * A predecessor of step X is any step that must have executed before X
 * in the execution order.
 *
 * This uses topological order: for each step, its predecessors are the
 * union of all steps that can reach it via successor edges.
 */
export function computePredecessors(
	topologicalOrder: string[],
	successors: Map<string, Set<string>>,
): Map<string, Set<string>> {
	const predecessors = new Map<string, Set<string>>();

	for (const id of topologicalOrder) {
		predecessors.set(id, new Set());
	}

	for (const id of topologicalOrder) {
		const succs = successors.get(id);
		if (!succs) continue;

		for (const succ of succs) {
			const predSet = predecessors.get(succ);
			if (!predSet) continue;

			// succ's predecessors include id and all of id's predecessors
			predSet.add(id);
			const idPreds = predecessors.get(id);
			if (idPreds) {
				for (const p of idPreds) {
					predSet.add(p);
				}
			}
		}
	}

	return predecessors;
}

/**
 * Compute topological order using Kahn's algorithm.
 * Returns null if cycles exist.
 */
export function topologicalSort(
	stepIds: string[],
	successors: Map<string, Set<string>>,
): string[] | null {
	const inDegree = new Map<string, number>();
	const stepIdSet = new Set(stepIds);

	for (const id of stepIds) {
		inDegree.set(id, 0);
	}

	for (const id of stepIds) {
		const succs = successors.get(id);
		if (!succs) continue;
		for (const s of succs) {
			if (stepIdSet.has(s)) {
				inDegree.set(s, (inDegree.get(s) ?? 0) + 1);
			}
		}
	}

	const queue: string[] = [];
	for (const [id, deg] of inDegree) {
		if (deg === 0) queue.push(id);
	}

	const order: string[] = [];
	while (queue.length > 0) {
		const node = queue.shift();
		if (node === undefined) break;
		order.push(node);

		const succs = successors.get(node);
		if (!succs) continue;
		for (const s of succs) {
			if (!stepIdSet.has(s)) continue;
			const currentDeg = inDegree.get(s);
			if (currentDeg === undefined) continue;
			const newDeg = currentDeg - 1;
			inDegree.set(s, newDeg);
			if (newDeg === 0) {
				queue.push(s);
			}
		}
	}

	return order.length === stepIds.length ? order : null;
}

/**
 * Walk the execution graph to determine which loop variables (itemName)
 * are in scope at each step, and which steps belong to a body (loop or branch).
 */
export function computeLoopScopesAndOwnership(
	initialStepId: string,
	stepIndex: Map<string, WorkflowStep>,
): {
	loopVariablesInScope: Map<string, Set<string>>;
	bodyOwnership: Map<string, string>;
} {
	const loopVariablesInScope = new Map<string, Set<string>>();
	const bodyOwnership = new Map<string, string>();

	function walkChain(
		startId: string,
		loopVars: Set<string>,
		ownerStepId: string | null,
	) {
		// First pass: claim all steps on this chain (following nextStepId only)
		// This ensures the main chain is claimed before body sub-chains,
		// so body chains can't accidentally claim main-chain steps.
		let currentId: string | undefined = startId;
		const chainSteps: import("../../types").WorkflowStep[] = [];

		while (currentId) {
			if (loopVariablesInScope.has(currentId)) break;

			const step = stepIndex.get(currentId);
			if (!step) break;

			loopVariablesInScope.set(currentId, new Set(loopVars));
			if (ownerStepId !== null) {
				bodyOwnership.set(currentId, ownerStepId);
			}

			chainSteps.push(step);
			currentId = step.nextStepId;
		}

		// Second pass: recurse into control flow sub-chains (bodies)
		for (const step of chainSteps) {
			if (step.type === "for-each") {
				const innerVars = new Set(loopVars);
				innerVars.add(step.params.itemName);
				walkChain(step.params.loopBodyStepId, innerVars, step.id);
			}

			if (step.type === "switch-case") {
				for (const c of step.params.cases) {
					walkChain(c.branchBodyStepId, loopVars, step.id);
				}
			}
		}
	}

	walkChain(initialStepId, new Set(), null);

	return { loopVariablesInScope, bodyOwnership };
}

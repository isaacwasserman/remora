import {
    type NestedChain,
    nestedChainEntryPoints,
    nestedChains,
    type WorkflowDefinition,
    type WorkflowStep,
} from "@remoraflow/core";
import { formatExpression } from "../utils/expression-display";

export type CompactEntry =
    | { kind: "step"; step: WorkflowStep; chains: CompactChain[] }
    | { kind: "jump"; targetStepId: string };

export interface CompactChain {
    label: string;
    entries: CompactEntry[];
}

function chainLabel(step: WorkflowStep, chain: NestedChain): string {
    if (step.type === "switch-case") {
        const value = step.params.cases[chain.path[2] as number]?.value;
        return !value || value.type === "default"
            ? "Default"
            : `Case ${formatExpression(value)}`;
    }
    return chain.path.at(-1) === "conditionStepId" ? "Condition" : "Loop body";
}

/**
 * Orders a workflow's steps for a list view. Each step appears once, with its
 * nested chains under it; a later reference to an already listed or missing
 * step becomes a jump entry. Steps the initial step cannot reach are grouped
 * into chains that start where nothing else points.
 */
export function buildStepList(workflow: WorkflowDefinition) {
    const stepsById = new Map(workflow.steps.map((step) => [step.id, step]));
    const listed = new Set<string>();

    const walkChain = (entryStepId: string): CompactEntry[] => {
        const entries: CompactEntry[] = [];
        let stepId: string | undefined = entryStepId;
        while (stepId) {
            const step = stepsById.get(stepId);
            if (!step || listed.has(stepId)) {
                entries.push({ kind: "jump", targetStepId: stepId });
                break;
            }
            listed.add(step.id);
            entries.push({
                kind: "step",
                step,
                chains: nestedChains(step).map((chain) => ({
                    label: chainLabel(step, chain),
                    entries: chain.entryPointStepId
                        ? walkChain(chain.entryPointStepId)
                        : [],
                })),
            });
            stepId = step.nextStepId;
        }
        return entries;
    };

    const entries = stepsById.has(workflow.initialStepId)
        ? walkChain(workflow.initialStepId)
        : [];

    const unlisted = workflow.steps.filter((step) => !listed.has(step.id));
    const referencedByUnlisted = new Set(
        unlisted.flatMap((step) => [
            ...(step.nextStepId ? [step.nextStepId] : []),
            ...nestedChainEntryPoints(step),
        ]),
    );
    const unreachable = [
        ...unlisted.filter((step) => !referencedByUnlisted.has(step.id)),
        ...unlisted,
    ].flatMap((step) => (listed.has(step.id) ? [] : [walkChain(step.id)]));

    return { entries, unreachable };
}

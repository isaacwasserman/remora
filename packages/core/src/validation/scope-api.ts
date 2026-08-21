import type { JSONSchema7 } from "json-schema";
import type { WorkflowDefinition, WorkflowStep } from "../schema";
import type { ToolSet } from "../types";
import { buildStepIndex } from "../utils";
import type { RemoraflowType } from "./types";
import {
    buildScopeSnapshotsById,
    type TypeScope,
} from "./variable-reference-validation";

export interface ScopeBinding {
    name: string;
    schema: RemoraflowType;
    origin:
        | { kind: "workflow-input" }
        | { kind: "step-output"; stepId: string }
        | { kind: "loop-variable"; stepId: string };
    description?: string;
}

function typeScopeToBindings(
    scope: TypeScope,
    workflow: WorkflowDefinition,
): ScopeBinding[] {
    const stepsById = buildStepIndex(workflow);
    const seen = new Set<string>();
    const bindings: ScopeBinding[] = [];
    let cursor: TypeScope | null = scope;
    while (cursor) {
        for (const [name, schema] of cursor.bindings.entries()) {
            if (seen.has(name)) continue;
            seen.add(name);
            const step = stepsById.get(name) as
                | (WorkflowStep & { index: number })
                | undefined;
            const origin: ScopeBinding["origin"] =
                name === "input"
                    ? { kind: "workflow-input" }
                    : step
                      ? { kind: "step-output", stepId: step.id }
                      : { kind: "loop-variable", stepId: name };
            bindings.push({
                name,
                schema,
                origin,
                description: step?.description,
            });
        }
        cursor = cursor.parent;
    }
    return bindings;
}

export function scopeAt(
    workflow: WorkflowDefinition,
    stepId: string,
    tools: ToolSet,
    options?: { position?: "step-entry" | "after-nested-chain" },
): ScopeBinding[] {
    const snapshots = buildScopeSnapshotsById(workflow, tools);
    const scope =
        options?.position === "after-nested-chain"
            ? snapshots.nestedChainScopeByStepId.get(stepId)
            : snapshots.byStepId.get(stepId);
    if (!scope) return [];
    return typeScopeToBindings(scope, workflow);
}

export function scopesByStepId(
    workflow: WorkflowDefinition,
    tools: ToolSet,
): Map<string, ScopeBinding[]> {
    const snapshots = buildScopeSnapshotsById(workflow, tools);
    const result = new Map<string, ScopeBinding[]>();
    for (const [stepId, scope] of snapshots.byStepId) {
        result.set(stepId, typeScopeToBindings(scope, workflow));
    }
    return result;
}

export function scopeSchema(bindings: readonly ScopeBinding[]): JSONSchema7 {
    const properties: Record<string, RemoraflowType> = {};
    const required: string[] = [];
    for (const b of bindings) {
        properties[b.name] = b.schema;
        required.push(b.name);
    }
    return { type: "object", properties, required } as JSONSchema7;
}

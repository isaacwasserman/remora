import type { StepType, WorkflowStep } from "@remoraflow/core";
import { STEP_UI } from "../step-ui/registry";

let counter = 0;

function nextId(type: string, existingIds?: Set<string>): string {
    counter++;
    let id = `${type.replace(/-/g, "_")}_${counter}`;
    if (existingIds) {
        while (existingIds.has(id)) {
            counter++;
            id = `${type.replace(/-/g, "_")}_${counter}`;
        }
    }
    return id;
}

export function resetStepCounter(): void {
    counter = 0;
}

export function createDefaultStep(
    type: WorkflowStep["type"],
    id?: string,
    existingIds?: Set<string>,
): WorkflowStep {
    const ui = STEP_UI[type as StepType];
    const base = {
        id: id ?? nextId(type, existingIds),
        name: ui.label,
        description: "",
        type,
    };

    const fields = ui.fields as Record<string, { initial: unknown }>;
    const order = ui.order as readonly string[];

    if (order.length === 0) {
        return base as WorkflowStep;
    }

    const params: Record<string, unknown> = {};
    for (const key of order) {
        const spec = fields[key];
        if (spec?.initial != null) {
            params[key] = spec.initial;
        }
    }

    if (Object.keys(params).length === 0) {
        return base as WorkflowStep;
    }

    return { ...base, params } as WorkflowStep;
}

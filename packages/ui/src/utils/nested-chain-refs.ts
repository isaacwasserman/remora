import {
    isBlockStep,
    nestedChainEntryPoints,
    nestedChains,
    type WorkflowStep,
} from "@remoraflow/core";

export { isBlockStep };

export function getChildStepIds(step: WorkflowStep): string[] {
    return nestedChainEntryPoints(step).filter((id) => id !== "");
}

function setIn(
    obj: Record<string, unknown>,
    path: PropertyKey[],
    value: unknown,
): Record<string, unknown> {
    if (path.length === 0) return obj;
    const head = path[0] as string;
    const rest = path.slice(1);
    if (rest.length === 0) {
        return { ...obj, [head]: value };
    }
    const child = obj[head];
    if (Array.isArray(child)) {
        const idx = rest[0] as number;
        const newArr = [...child];
        newArr[idx] = setIn(
            newArr[idx] as Record<string, unknown>,
            rest.slice(1),
            value,
        );
        return { ...obj, [head]: newArr };
    }
    return {
        ...obj,
        [head]: setIn((child ?? {}) as Record<string, unknown>, rest, value),
    };
}

function getIn(obj: unknown, path: PropertyKey[]): unknown {
    let current = obj;
    for (const key of path) {
        if (current == null || typeof current !== "object") return undefined;
        current = (current as Record<string, unknown>)[key as string];
    }
    return current;
}

export function clearChildRef(
    step: WorkflowStep,
    targetId: string,
): WorkflowStep {
    let changed = false;
    let result: Record<string, unknown> = step as unknown as Record<
        string,
        unknown
    >;
    for (const chain of nestedChains(step)) {
        if (getIn(step, chain.path) === targetId) {
            result = setIn(result, chain.path, "");
            changed = true;
        }
    }
    return changed ? (result as unknown as WorkflowStep) : step;
}

export function clearAllChildRefs(step: WorkflowStep): WorkflowStep {
    let result: Record<string, unknown> = step as unknown as Record<
        string,
        unknown
    >;
    for (const chain of nestedChains(step)) {
        result = setIn(result, chain.path, "");
    }
    return result as unknown as WorkflowStep;
}

export function replaceChildRef(
    step: WorkflowStep,
    oldId: string,
    newId: string,
): WorkflowStep {
    let changed = false;
    let result: Record<string, unknown> = step as unknown as Record<
        string,
        unknown
    >;
    for (const chain of nestedChains(step)) {
        if (getIn(step, chain.path) === oldId) {
            result = setIn(result, chain.path, newId);
            changed = true;
        }
    }
    return changed ? (result as unknown as WorkflowStep) : step;
}

export function setChildRef(
    step: WorkflowStep,
    targetId: string,
): WorkflowStep {
    for (const chain of nestedChains(step)) {
        if (getIn(step, chain.path) === "") {
            return setIn(
                step as unknown as Record<string, unknown>,
                chain.path,
                targetId,
            ) as unknown as WorkflowStep;
        }
    }
    return step;
}

export function groupStructuralKey(step: WorkflowStep): string {
    if (!isBlockStep(step)) return "";
    return nestedChains(step)
        .map((c) => `${c.path.join(".")}=${c.entryPointStepId}`)
        .join(":");
}

import {
    evaluateExpressionAgainstScope,
    expressionReferences,
    type WorkflowStep,
} from "@remoraflow/core";

function setAtPath(
    target: Record<string, unknown>,
    path: PropertyKey[],
    value: unknown,
) {
    let cursor: Record<string, unknown> | unknown[] = target;
    for (const key of path.slice(0, -1)) {
        const next = cursor[key as keyof typeof cursor];
        if (!next || typeof next !== "object") return;
        cursor = next as Record<string, unknown> | unknown[];
    }
    const last = path.at(-1);
    if (last !== undefined) cursor[last as keyof typeof cursor] = value;
}

/** Resolves the expressions in a step's JSON parameters against its run scope. */
export function renderStepParams(
    step: WorkflowStep,
    scope: Record<string, unknown>,
): Record<string, unknown> | undefined {
    const source = (step as { params?: Record<string, unknown> }).params;
    if (!source) return undefined;

    const rendered = structuredClone(source);
    for (const reference of expressionReferences(step)) {
        // This condition is evaluated after its private nested chain, whose
        // scope is not part of the parent step's execution snapshot.
        if (reference.against === "nested-chain") continue;
        setAtPath(
            rendered,
            reference.path.slice(1),
            evaluateExpressionAgainstScope(reference.expression, scope),
        );
    }
    if (step.type === "request-intervention") {
        rendered.question = evaluateExpressionAgainstScope(
            step.params.question,
            scope,
        );
        rendered.choices = evaluateExpressionAgainstScope(
            step.params.choices,
            scope,
        );
    }
    return rendered;
}

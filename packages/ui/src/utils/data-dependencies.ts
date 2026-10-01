import {
    type Expression,
    expressionReferences,
    extractTemplateInserts,
    queryRootNames,
    type WorkflowDefinition,
} from "@remoraflow/core";

export interface DataDependency {
    sourceStepId: string;
    targetStepId: string;
}

function expressionRootNames(expression: Expression): string[] {
    switch (expression.type) {
        case "jmespath":
            return queryRootNames(expression.expression);
        case "template":
            return extractTemplateInserts(expression.template).flatMap(
                (insert) => queryRootNames(insert.expression),
            );
        default:
            return [];
    }
}

/** One dependency per (producer, consumer) pair where a step's expressions read another step's output. */
export function deriveDataDependencies(
    workflow: WorkflowDefinition,
): DataDependency[] {
    const stepIds = new Set(workflow.steps.map((step) => step.id));
    const dependencies: DataDependency[] = [];
    for (const step of workflow.steps) {
        const sourceStepIds = new Set(
            expressionReferences(step)
                .flatMap((ref) => expressionRootNames(ref.expression))
                .filter((name) => name !== step.id && stepIds.has(name)),
        );
        for (const sourceStepId of sourceStepIds) {
            dependencies.push({ sourceStepId, targetStepId: step.id });
        }
    }
    return dependencies;
}

/** Stable string form of {@link deriveDataDependencies}, for change detection. */
export function dataDependenciesKey(workflow: WorkflowDefinition): string {
    return deriveDataDependencies(workflow)
        .map((d) => `${d.sourceStepId}>${d.targetStepId}`)
        .join(",");
}

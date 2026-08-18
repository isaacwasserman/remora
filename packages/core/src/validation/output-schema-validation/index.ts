import type { WorkflowDefinition, WorkflowStep } from "../../schema";
import {
    type SubsetDiagnostic,
    schemaSubsetDiagnostics,
} from "../../schemistry";
import { type NestedChain, nestedChains } from "../../step-registry";
import type { ToolSet } from "../../types";
import { buildStepIndex } from "../../utils";
import type { ValidationModule, ValidatorDiagnostic } from "../types";
import {
    buildScopeSnapshotsById,
    getStepOutputType,
    type ScopeSnapshots,
} from "../variable-reference-validation";

function terminalStepIds(
    stepsById: Map<string, WorkflowStep>,
    startStepId: string,
    seen: Set<string>,
): string[] {
    if (seen.has(startStepId)) return [];
    seen.add(startStepId);

    const step = stepsById.get(startStepId);
    if (!step) return [];

    if (step.nextStepId) {
        return terminalStepIds(stepsById, step.nextStepId, seen);
    }

    if (step.type === "end") {
        return [startStepId];
    }

    if (
        step.type === "switch-case" ||
        step.type === "for-each" ||
        step.type === "while"
    ) {
        const terminalChains = nestedChains(step).filter(
            (chain) => chain.contributesOutput,
        );
        return terminalChains.flatMap((chain: NestedChain) =>
            terminalStepIds(stepsById, chain.entryPointStepId, seen),
        );
    }

    return [];
}

function subsetDiagnosticsToValidatorDiagnostics(
    diagnostics: SubsetDiagnostic[],
    stepIndex: number,
): ValidatorDiagnostic[] {
    return diagnostics.map(
        (d): ValidatorDiagnostic =>
            d.level === "error"
                ? {
                      severity: "error",
                      path: ["steps", stepIndex, "params", "output", ...d.path],
                      message: d.message,
                  }
                : {
                      severity: "warning",
                      path: ["steps", stepIndex, "params", "output", ...d.path],
                      message: d.message,
                  },
    );
}

export function validateOutputSchema(
    workflowDefinition: WorkflowDefinition,
    tools: ToolSet,
): ValidatorDiagnostic[] {
    if (!workflowDefinition.outputSchema) return [];

    const stepsById = buildStepIndex(workflowDefinition);
    const snapshots: ScopeSnapshots = buildScopeSnapshotsById(
        workflowDefinition,
        tools,
    );
    const diagnostics: ValidatorDiagnostic[] = [];

    const terminals = terminalStepIds(
        stepsById,
        workflowDefinition.initialStepId,
        new Set(),
    );

    for (const stepId of terminals) {
        const step = stepsById.get(stepId);
        if (!step || step.type !== "end") continue;

        const scope = snapshots.byStepId.get(stepId);
        if (!scope) continue;

        const outputType = getStepOutputType(
            step,
            scope,
            tools,
            workflowDefinition.inputSchema,
        );

        const subsetDiagnostics = schemaSubsetDiagnostics(
            outputType,
            workflowDefinition.outputSchema,
        );
        diagnostics.push(
            ...subsetDiagnosticsToValidatorDiagnostics(
                subsetDiagnostics,
                step.index,
            ),
        );
    }

    return diagnostics;
}

export const outputSchemaValidator: ValidationModule = {
    id: "output-schema",
    failureMode: "continue",
    validate: (workflowDefinition, context) => ({
        diagnostics: validateOutputSchema(workflowDefinition, context.tools),
    }),
};

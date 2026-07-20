import { asSchema } from "ai";
import type {
    Expression,
    WorkflowDefinition,
    WorkflowStep,
} from "../../schema";
import { extractTemplateInserts } from "../../template-strings";
import { buildStepIndex } from "../../utils";
import type { ToolSet } from "..";
import type { RemoraflowType, ValidationModule, ValidatorDiagnostic } from "../types";
import { inferRemoraflowType } from "./json-schema-inference";
import {
    type BadAccessDiagnostic,
    inferQueryOutputSchema,
    unionSchemas,
} from "./type-inference";

type Scope = { parent: Scope | null; bindings: Map<string, RemoraflowType> };

function _lookupInScope(scope: Scope, name: string): RemoraflowType | null {
    const typeWithinCurrentScope = scope.bindings.get(name);
    if (typeWithinCurrentScope) {
        return typeWithinCurrentScope;
    }

    if (scope.parent) {
        const typeWithinParentScope = _lookupInScope(scope.parent, name);
        if (typeWithinParentScope) {
            return typeWithinParentScope;
        }
    }
    return null;
}

function _extendScope(scope: Scope, name: string, type: RemoraflowType) {
    const newScope = new Map<string, RemoraflowType>();
    newScope.set(name, type);
    return { scope: newScope, parent: scope };
}

type StepGraphEdge = {
    type: "definite" | "block-entrance" | "block-exit";
    stepNode: StepGraphNode;
};

type StepGraphNode = {
    stepId: string;
    nextEdges: StepGraphEdge[];
};

function buildStepGraph(
    stepsById: Map<string, WorkflowStep>,
    currentStepId: string,
    blockStepIdStack: string[],
): StepGraphNode {
    const step = stepsById.get(currentStepId);
    if (!step) {
        throw new Error(
            `Step "${currentStepId}" could not be found in workflow.`,
        );
    }
    if (step.type === "switch-case") {
        const nextEdges: StepGraphEdge[] = step.params.cases.map(
            (branchCase) => ({
                type: "block-entrance" as const,
                stepNode: buildStepGraph(
                    stepsById,
                    branchCase.branchBodyStepId,
                    [...blockStepIdStack, currentStepId],
                ),
            }),
        );
        const node: StepGraphNode = { stepId: currentStepId, nextEdges };
        return node;
    } else if (step.type === "for-each") {
        const nextEdges: StepGraphEdge[] = [
            {
                type: "block-entrance" as const,
                stepNode: buildStepGraph(
                    stepsById,
                    step.params.loopBodyStepId,
                    [...blockStepIdStack, currentStepId],
                ),
            },
        ];
        const node: StepGraphNode = { stepId: currentStepId, nextEdges };
        return node;
    } else if (step.nextStepId) {
        return {
            stepId: currentStepId,
            nextEdges: [
                {
                    type: "definite" as const,
                    stepNode: buildStepGraph(
                        stepsById,
                        step.nextStepId,
                        blockStepIdStack,
                    ),
                },
            ],
        };
    } else if (blockStepIdStack.length > 0) {
        const blockStepId = blockStepIdStack[
            blockStepIdStack.length - 1
        ] as string;
        const newBlockStepIdStack = blockStepIdStack.slice(0, -1);
        const blockStep = stepsById.get(blockStepId) as WorkflowStep;
        if (blockStep.nextStepId) {
            return {
                stepId: currentStepId,
                nextEdges: [
                    {
                        type: "block-exit" as const,
                        stepNode: buildStepGraph(
                            stepsById,
                            blockStep.nextStepId,
                            newBlockStepIdStack,
                        ),
                    },
                ],
            };
        }
    }
    return { stepId: currentStepId, nextEdges: [] };
}

function scopeToJsonSchema(scope: Scope): RemoraflowType {
    const resolvedBindings = new Map<string, RemoraflowType>();
    let scopeCursor = scope;
    while (scopeCursor.parent) {
        for (const [name, value] of scopeCursor.bindings.entries()) {
            if (!resolvedBindings.get(name)) {
                resolvedBindings.set(name, value);
            }
        }
        scopeCursor = scopeCursor.parent;
    }

    const fullSchema = {
        type: "object",
        properties: Object.fromEntries(resolvedBindings.entries()),
        required: Array.from(resolvedBindings.keys()),
    } as const;

    return fullSchema;
}

function getJmesPathType(
    _jmesPathExpression: string,
    scope: Scope,
): RemoraflowType {
    const _scopeSchema = scopeToJsonSchema(scope);
    const { schema: outputType } = inferQueryOutputSchema(
        _scopeSchema,
        _jmesPathExpression,
    );
    return outputType;
}

function getExpressionType(
    expression: Expression,
    scope: Scope,
): RemoraflowType {
    switch (expression.type) {
        case "literal": {
            return inferRemoraflowType(expression.value);
        }
        case "template": {
            return { type: "string" };
        }
        case "jmespath": {
            return getJmesPathType(expression.expression, scope);
        }
    }
}

function getStepOutputType(
    step: WorkflowStep,
    scope: Scope,
    tools: ToolSet,
): RemoraflowType {
    switch (step.type) {
        case "agent-loop": {
            return step.params.outputFormat;
        }
        case "end": {
            return step.params?.output
                ? getExpressionType(step.params.output, scope)
                : { type: "null" };
        }
        case "extract-data": {
            return step.params.outputFormat;
        }
        case "for-each": {
            return { type: "null" };
        }
        case "llm-prompt": {
            return step.params.outputFormat;
        }
        case "sleep": {
            return { type: "null" };
        }
        case "start": {
            return { type: "null" };
        }
        case "switch-case": {
            return { type: "null" };
        }
        case "tool-call": {
            const tool = tools[step.params.toolName];
            if (tool) {
                const outputFlexibleSchema = tool.outputSchema;
                if (outputFlexibleSchema) {
                    const outputSchema =
                        asSchema(outputFlexibleSchema).jsonSchema;
                    if (outputSchema instanceof Promise) {
                        throw new Error(
                            `The output schema for ${step.params.toolName} is a promise. Asynchronously resolved schemas are not compatible with Remoraflow.`,
                        );
                    }
                    return outputSchema as RemoraflowType;
                }
            }
            return true;
        }
        case "wait-for-condition": {
            return { type: "null" };
        }
    }
}

function collectBindingsSinceScope(
    scope: Scope,
    boundary: Scope,
): Map<string, RemoraflowType> {
    const collected = new Map<string, RemoraflowType>();
    let cursor: Scope | null = scope;
    while (cursor && cursor !== boundary) {
        for (const [name, value] of cursor.bindings.entries()) {
            if (!collected.has(name)) {
                collected.set(name, value);
            }
        }
        cursor = cursor.parent;
    }
    return collected;
}

function mergeBranchScopes(originalScope: Scope, branchScopes: Scope[]): Scope {
    const perBranchBindings = branchScopes.map((bs) =>
        collectBindingsSinceScope(bs, originalScope),
    );
    const allNames = new Set<string>();
    for (const bindings of perBranchBindings) {
        for (const name of bindings.keys()) allNames.add(name);
    }

    const mergedBindings = new Map<string, RemoraflowType>();
    for (const name of allNames) {
        // NOTE: assumes a name present in only some branches should just take
        // the union of whichever branches define it, with no "possibly absent"
        // marker. Flag if that's wrong for your type system.
        const typesAcrossBranches = perBranchBindings
            .map((bindings) => bindings.get(name))
            .filter((t): t is RemoraflowType => t !== undefined);
        mergedBindings.set(name, unionSchemas(typesAcrossBranches));
    }

    return { parent: originalScope, bindings: mergedBindings };
}

type ChainResult = { node: StepGraphNode; scope: Scope } | null;

function processChain(
    stepsById: Map<string, WorkflowStep>,
    node: StepGraphNode,
    scope: Scope,
    tools: ToolSet,
    snapshots: Map<string, Scope>,
): ChainResult {
    snapshots.set(node.stepId, scope);
    const currentStep = stepsById.get(node.stepId) as WorkflowStep;
    const outputType = getStepOutputType(currentStep, scope, tools);
    const newBindings = new Map<string, RemoraflowType>();
    newBindings.set(node.stepId, outputType);
    const newScope: Scope = { parent: scope, bindings: newBindings };

    if (currentStep.type === "switch-case") {
        return processSwitchCase(stepsById, node, newScope, tools, snapshots);
    }
    if (currentStep.type === "for-each") {
        return processForEach(
            stepsById,
            node,
            currentStep,
            newScope,
            tools,
            snapshots,
        );
    }

    const edge = node.nextEdges[0];
    if (!edge) return null; // true dead end (e.g. an `end` step)
    if (edge.type === "block-exit") {
        return { node: edge.stepNode, scope: newScope };
    }
    return processChain(stepsById, edge.stepNode, newScope, tools, snapshots);
}

function processSwitchCase(
    stepsById: Map<string, WorkflowStep>,
    node: StepGraphNode,
    scope: Scope,
    tools: ToolSet,
    snapshots: Map<string, Scope>,
): ChainResult {
    const results = node.nextEdges.map((edge) =>
        processChain(stepsById, edge.stepNode, scope, tools, snapshots),
    );
    const live = results.filter(
        (r): r is Exclude<ChainResult, null> => r !== null,
    );

    // every case dead-ends (e.g. all cases terminate in `end`) — nothing after
    // the switch is reachable on this path, so nothing further gets snapshotted.
    if (live.length === 0) return null;

    const mergedScope = mergeBranchScopes(
        scope,
        live.map((r) => r.scope),
    );
    // all live branches rebuilt the same shared continuation subgraph;
    // process it once, with the merged scope.
    return processChain(
        stepsById,
        live[0]?.node as StepGraphNode,
        mergedScope,
        tools,
        snapshots,
    );
}

function processForEach(
    stepsById: Map<string, WorkflowStep>,
    node: StepGraphNode,
    step: Extract<WorkflowStep, { type: "for-each" }>,
    scope: Scope,
    tools: ToolSet,
    snapshots: Map<string, Scope>,
): ChainResult {
    const targetType = getExpressionType(
        step.params.target,
        scope,
    ) as RemoraflowType & { type: "array" } & object;
    const elementType = (
        targetType.items
            ? Array.isArray(targetType.items)
                ? targetType.items[0]
                : targetType.items
            : true
    ) as RemoraflowType;
    const loopBindings = new Map<string, RemoraflowType>();
    loopBindings.set(step.params.itemName, elementType);
    const loopScope: Scope = { parent: scope, bindings: loopBindings };

    const loopEdge = node.nextEdges[0] as StepGraphEdge;
    const bodyResult = processChain(
        stepsById,
        loopEdge.stepNode,
        loopScope,
        tools,
        snapshots,
    );
    if (bodyResult === null) return null; // loop body never exits — nothing after is reachable

    // continue with the pre-loop `scope`, not `loopScope` or `bodyResult.scope` —
    // no bindings from inside the loop escape.
    return processChain(stepsById, bodyResult.node, scope, tools, snapshots);
}

function buildScopeSnapshotsById(
    workflowDefinition: WorkflowDefinition,
    tools: ToolSet,
) {
    const stepsById = buildStepIndex(workflowDefinition);
    const stepGraph = buildStepGraph(
        stepsById,
        workflowDefinition.initialStepId,
        [],
    );
    const snapshots = new Map<string, Scope>();
    const initialBindings = new Map<string, RemoraflowType>();
    if (workflowDefinition.inputSchema) {
        initialBindings.set("input", workflowDefinition.inputSchema);
    }
    const initialScope = { parent: null, bindings: initialBindings };
    processChain(stepsById, stepGraph, initialScope, tools, snapshots);
    return snapshots;
}

function badAccessDiagnosticsToValidatorDiagnostics(
    badAccessDiagnostics: BadAccessDiagnostic[],
    path: ValidatorDiagnostic["path"],
): ValidatorDiagnostic[] {
    return badAccessDiagnostics.map(
        (diagnostic): ValidatorDiagnostic =>
            diagnostic.badAccess === "true"
                ? { severity: "error", path, message: diagnostic.message }
                : { severity: "warning", path, message: diagnostic.message },
    );
}

export function validateVariableReferences(
    workflowDefinition: WorkflowDefinition,
    tools: ToolSet,
): ValidatorDiagnostic[] {
    const scopeSnapshotsByStepId = buildScopeSnapshotsById(
        workflowDefinition,
        tools,
    );
    const diagnostics: ValidatorDiagnostic[] = [];
    for (const [stepIndex, step] of workflowDefinition.steps.entries()) {
        const scopeAtStep = scopeSnapshotsByStepId.get(step.id) as Scope;
        const scopeJsonSchema = scopeToJsonSchema(scopeAtStep);
        function validateJmespathExpressionReferences(
            expression: string,
            path: ValidatorDiagnostic["path"],
        ) {
            const { diagnostics: badAccessDiagnostics } =
                inferQueryOutputSchema(scopeJsonSchema, expression);
            diagnostics.push(
                ...badAccessDiagnosticsToValidatorDiagnostics(
                    badAccessDiagnostics,
                    path,
                ),
            );
        }
        function validateTemplateStringReferences(
            templateString: string,
            path: ValidatorDiagnostic["path"],
        ) {
            const templateJmespathExpressions = extractTemplateInserts(
                templateString,
            ).map((insert) => insert.expression);
            for (const expression of templateJmespathExpressions) {
                validateJmespathExpressionReferences(expression, path);
            }
        }
        function validateExpressionReferences(
            expression: Expression,
            path: ValidatorDiagnostic["path"],
        ) {
            switch (expression.type) {
                case "jmespath": {
                    validateJmespathExpressionReferences(
                        expression.expression,
                        [...(path ?? []), "expression"],
                    );
                    break;
                }
                case "template": {
                    validateTemplateStringReferences(expression.template, [
                        ...(path ?? []),
                        "template",
                    ]);
                    break;
                }
            }
        }
        switch (step.type) {
            case "agent-loop": {
                validateTemplateStringReferences(step.params.instructions, [
                    "steps",
                    stepIndex,
                    "params",
                    "instructions",
                ]);
                break;
            }
            case "end": {
                if (step.params) {
                    validateExpressionReferences(step.params.output, [
                        "steps",
                        stepIndex,
                        "params",
                        "output",
                    ]);
                }
                break;
            }
            case "extract-data": {
                validateExpressionReferences(step.params.sourceData, [
                    "steps",
                    stepIndex,
                    "params",
                    "sourceData",
                ]);
                break;
            }
            case "for-each": {
                validateExpressionReferences(step.params.target, [
                    "steps",
                    stepIndex,
                    "params",
                    "target",
                ]);
                break;
            }
            case "llm-prompt": {
                validateTemplateStringReferences(step.params.prompt, [
                    "steps",
                    stepIndex,
                    "params",
                    "prompt",
                ]);
                break;
            }
            case "sleep": {
                validateExpressionReferences(step.params.durationMs, [
                    "steps",
                    stepIndex,
                    "params",
                    "durationMs",
                ]);
                break;
            }
            case "start": {
                break;
            }
            case "switch-case": {
                validateExpressionReferences(step.params.switchOn, [
                    "steps",
                    stepIndex,
                    "params",
                    "switchOn",
                ]);
                for (const [
                    branchCaseIndex,
                    branchCase,
                ] of step.params.cases.entries()) {
                    if (branchCase.value.type === "default") continue;
                    validateExpressionReferences(branchCase.value, [
                        "steps",
                        stepIndex,
                        "params",
                        "cases",
                        branchCaseIndex,
                        "value",
                    ]);
                }
                break;
            }
            case "tool-call": {
                for (const [argName, argExpression] of Object.entries(
                    step.params.toolInput,
                )) {
                    validateExpressionReferences(argExpression, [
                        "steps",
                        stepIndex,
                        "params",
                        "toolInput",
                        argName,
                    ]);
                }
                break;
            }
            case "wait-for-condition": {
                validateExpressionReferences(step.params.condition, [
                    "steps",
                    stepIndex,
                    "params",
                    "condition",
                ]);
                if (step.params.backoffMultiplier) {
                    validateExpressionReferences(
                        step.params.backoffMultiplier,
                        ["steps", stepIndex, "params", "backoffMultiplier"],
                    );
                }
                if (step.params.intervalMs) {
                    validateExpressionReferences(step.params.intervalMs, [
                        "steps",
                        stepIndex,
                        "params",
                        "intervalMs",
                    ]);
                }
                if (step.params.maxAttempts) {
                    validateExpressionReferences(step.params.maxAttempts, [
                        "steps",
                        stepIndex,
                        "params",
                        "maxAttempts",
                    ]);
                }
                if (step.params.timeoutMs) {
                    validateExpressionReferences(step.params.timeoutMs, [
                        "steps",
                        stepIndex,
                        "params",
                        "timeoutMs",
                    ]);
                }
                break;
            }
        }
    }
    return diagnostics;
}

export const variableReferenceValidator: ValidationModule = {
    id: "variable-reference",
    failureMode: "continue",
    validate: (workflowDefinition, {tools}) => {
        const diagnostics = validateVariableReferences(workflowDefinition, tools)
        return {diagnostics}
    }
}
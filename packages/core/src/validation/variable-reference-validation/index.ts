import { asSchema } from "ai";
import type {
    Expression,
    WorkflowDefinition,
    WorkflowStep,
} from "../../schema";
import {
    type BadAccessDiagnostic,
    extractTemplateInserts,
    inferJsonSchema,
    inferQueryOutputSchema,
    unionSchemas,
} from "../../schemistry";
import type { ToolSet } from "../../types";
import { buildStepIndex, nestedChainEntryPoints } from "../../utils";
import type {
    RemoraflowType,
    ValidationModule,
    ValidatorDiagnostic,
} from "../types";

export type TypeScope = {
    parent: TypeScope | null;
    bindings: Map<string, RemoraflowType>;
};

type StepGraphEdge = {
    type: "definite" | "block-entrance" | "block-continuation";
    stepNode: StepGraphNode;
};

type StepGraphNode = {
    stepId: string;
    nextEdges: StepGraphEdge[];
};

/**
 * A block step gets one `block-entrance` edge per nested chain plus a
 * `block-continuation` edge to its own `nextStepId`. A nested chain that runs
 * out of `nextStepId` simply dead-ends: the block step, not the chain's
 * terminal step, owns where execution resumes.
 */
function buildStepGraph(
    stepsById: Map<string, WorkflowStep>,
    currentStepId: string,
): StepGraphNode {
    const step = stepsById.get(currentStepId);
    if (!step) {
        throw new Error(
            `Step "${currentStepId}" could not be found in workflow.`,
        );
    }
    const nestedEdges: StepGraphEdge[] = nestedChainEntryPoints(step).map(
        (entryPointStepId) => ({
            type: "block-entrance",
            stepNode: buildStepGraph(stepsById, entryPointStepId),
        }),
    );
    const continuationEdges: StepGraphEdge[] = step.nextStepId
        ? [
              {
                  type:
                      nestedEdges.length > 0
                          ? "block-continuation"
                          : "definite",
                  stepNode: buildStepGraph(stepsById, step.nextStepId),
              },
          ]
        : [];
    return {
        stepId: currentStepId,
        nextEdges: [...nestedEdges, ...continuationEdges],
    };
}

function blockEntranceNodes(node: StepGraphNode): StepGraphNode[] {
    return node.nextEdges
        .filter((edge) => edge.type === "block-entrance")
        .map((edge) => edge.stepNode);
}

function continuationNode(node: StepGraphNode): StepGraphNode | null {
    return (
        node.nextEdges.find(
            (edge) =>
                edge.type === "definite" || edge.type === "block-continuation",
        )?.stepNode ?? null
    );
}

export function scopeToJsonSchema(scope: TypeScope): RemoraflowType {
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
    scope: TypeScope,
): RemoraflowType {
    const _scopeSchema = scopeToJsonSchema(scope);
    const { schema: outputType } = inferQueryOutputSchema(
        _scopeSchema,
        _jmesPathExpression,
    );
    return outputType;
}

export function getExpressionType(
    expression: Expression,
    scope: TypeScope,
): RemoraflowType {
    switch (expression.type) {
        case "literal": {
            return inferJsonSchema(expression.value);
        }
        case "template": {
            return { type: "string" };
        }
        case "jmespath": {
            return getJmesPathType(expression.expression, scope);
        }
    }
}

/**
 * The type bound to `steps.<id>` for a step's output. This is the declared half
 * of a contract whose other half is whatever the step's executor writes to
 * `scope[step.id]`; `step-output-contract.test.ts` asserts the two agree.
 */
export function getStepOutputType(
    step: WorkflowStep,
    scope: TypeScope,
    tools: ToolSet,
): RemoraflowType {
    switch (step.type) {
        case "agent-loop": {
            return step.params.outputFormat;
        }
        case "request-intervention": {
            return { type: "string" };
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
            // Refined to `{ type: "array", items: <loop body output type> }` by
            // the for-each entry in `blockScopeProcessors`, which has walked the
            // loop body and so knows its output type.
            return { type: "array" };
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
            // Binds the truthy value the condition expression settled on. That
            // expression is evaluated against the condition chain's scope, whose
            // bindings are not in `scope` here, so its type cannot be inferred.
            return true;
        }
    }
}

function collectBindingsSinceScope(
    scope: TypeScope,
    boundary: TypeScope,
): Map<string, RemoraflowType> {
    const collected = new Map<string, RemoraflowType>();
    let cursor: TypeScope | null = scope;
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

function mergeBranchScopes(
    originalScope: TypeScope,
    branchScopes: TypeScope[],
): TypeScope {
    const perBranchBindings = branchScopes.map((bs) =>
        collectBindingsSinceScope(bs, originalScope),
    );
    const allNames = new Set<string>();
    for (const bindings of perBranchBindings) {
        for (const name of bindings.keys()) allNames.add(name);
    }

    const mergedBindings = new Map<string, RemoraflowType>();
    for (const name of allNames) {
        const typesAcrossBranches = perBranchBindings
            .map((bindings) => bindings.get(name))
            .filter((t): t is RemoraflowType => t !== undefined);
        // A branch that never bound the name leaves it absent, and JMESPath
        // reads an absent name as null — so unless every branch binds it, the
        // merged type has to admit null and reads of it are flagged as
        // possibly-null rather than as definitely present.
        const boundByEveryBranch =
            typesAcrossBranches.length === perBranchBindings.length;
        mergedBindings.set(
            name,
            unionSchemas(
                boundByEveryBranch
                    ? typesAcrossBranches
                    : [...typesAcrossBranches, { type: "null" }],
            ),
        );
    }

    return { parent: originalScope, bindings: mergedBindings };
}

export type ScopeSnapshots = {
    /** Scope in effect when each step begins executing. */
    byStepId: Map<string, TypeScope>;
    /**
     * For a block step with an expression evaluated *after* its nested chain
     * runs, the scope that expression sees.
     */
    nestedChainScopeByStepId: Map<string, TypeScope>;
};

type BlockScopeProcessor<T extends WorkflowStep["type"]> = (args: {
    stepsById: Map<string, WorkflowStep>;
    node: StepGraphNode;
    step: Extract<WorkflowStep, { type: T }>;
    /** Scope after this step's own output binding is applied. */
    scope: TypeScope;
    tools: ToolSet;
    snapshots: ScopeSnapshots;
    /** Returns the scope at the end of a nested chain. */
    walkChain: (node: StepGraphNode, scope: TypeScope) => TypeScope;
}) => TypeScope;

/**
 * How each block step type scopes its nested chains and which bindings escape
 * into the continuation. Any type with a processor here must declare its chains
 * in {@link nestedChainEntryPoints}.
 */
const blockScopeProcessors: {
    [T in WorkflowStep["type"]]: BlockScopeProcessor<T> | null;
} = {
    "for-each": ({ node, step, scope, walkChain }) => {
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
        const loopScope: TypeScope = { parent: scope, bindings: loopBindings };

        const [bodyNode] = blockEntranceNodes(node);
        if (!bodyNode) return scope;
        const bodyEndScope = walkChain(bodyNode, loopScope);

        scope.bindings.set(node.stepId, {
            type: "array",
            items: innermostBindingType(bodyEndScope),
        });
        // Nothing from inside the loop escapes except the output set above.
        return scope;
    },
    "switch-case": ({ node, scope, walkChain }) => {
        const branchScopes = blockEntranceNodes(node).map((branchNode) =>
            walkChain(branchNode, scope),
        );
        if (branchScopes.length === 0) return scope;
        return mergeBranchScopes(scope, branchScopes);
    },
    "wait-for-condition": ({ node, scope, snapshots, walkChain }) => {
        const [conditionNode] = blockEntranceNodes(node);
        if (!conditionNode) return scope;
        // `condition` reads the chain's bindings, but the executor evaluates it
        // against a throwaway scope, so none of them escape the step.
        snapshots.nestedChainScopeByStepId.set(
            node.stepId,
            walkChain(conditionNode, scope),
        );
        return scope;
    },
    "agent-loop": null,
    "request-intervention": null,
    "extract-data": null,
    "llm-prompt": null,
    "tool-call": null,
    end: null,
    sleep: null,
    start: null,
};

/**
 * Walks a chain to its end, snapshotting the scope at each step, and returns
 * the scope in effect after its terminal step.
 */
function processChain(
    stepsById: Map<string, WorkflowStep>,
    node: StepGraphNode,
    scope: TypeScope,
    tools: ToolSet,
    snapshots: ScopeSnapshots,
): TypeScope {
    snapshots.byStepId.set(node.stepId, scope);
    const currentStep = stepsById.get(node.stepId) as WorkflowStep;
    const bindings = new Map<string, RemoraflowType>();
    bindings.set(node.stepId, getStepOutputType(currentStep, scope, tools));
    let scopeAfterStep: TypeScope = { parent: scope, bindings };

    const processBlock = blockScopeProcessors[
        currentStep.type
    ] as BlockScopeProcessor<WorkflowStep["type"]> | null;
    if (processBlock) {
        scopeAfterStep = processBlock({
            stepsById,
            node,
            step: currentStep,
            scope: scopeAfterStep,
            tools,
            snapshots,
            walkChain: (chainNode, chainScope) =>
                processChain(
                    stepsById,
                    chainNode,
                    chainScope,
                    tools,
                    snapshots,
                ),
        });
    }

    const continuation = continuationNode(node);
    if (!continuation) return scopeAfterStep;
    return processChain(
        stepsById,
        continuation,
        scopeAfterStep,
        tools,
        snapshots,
    );
}

function innermostBindingType(scope: TypeScope): RemoraflowType {
    const types = Array.from(scope.bindings.values());
    if (types.length === 0) return { type: "null" };
    return types.length === 1
        ? (types[0] as RemoraflowType)
        : unionSchemas(types);
}

export function buildScopeSnapshotsById(
    workflowDefinition: WorkflowDefinition,
    tools: ToolSet,
): ScopeSnapshots {
    const stepsById = buildStepIndex(workflowDefinition);
    const stepGraph = buildStepGraph(
        stepsById,
        workflowDefinition.initialStepId,
    );
    const snapshots: ScopeSnapshots = {
        byStepId: new Map(),
        nestedChainScopeByStepId: new Map(),
    };
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
    const scopeSnapshots = buildScopeSnapshotsById(workflowDefinition, tools);
    const diagnostics: ValidatorDiagnostic[] = [];
    for (const [stepIndex, step] of workflowDefinition.steps.entries()) {
        const scopeAtStep = scopeSnapshots.byStepId.get(step.id);
        // Only unreachable steps lack a scope, and control-flow validation
        // reports those and blocks the pipeline before this validator runs.
        if (!scopeAtStep) continue;
        const scopeJsonSchema = scopeToJsonSchema(scopeAtStep);
        function validateJmespathExpressionReferences(
            expression: string,
            path: ValidatorDiagnostic["path"],
            againstScopeJsonSchema: RemoraflowType = scopeJsonSchema,
        ) {
            const { diagnostics: badAccessDiagnostics } =
                inferQueryOutputSchema(againstScopeJsonSchema, expression);
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
            againstScopeJsonSchema: RemoraflowType = scopeJsonSchema,
        ) {
            const templateJmespathExpressions = extractTemplateInserts(
                templateString,
            ).map((insert) => insert.expression);
            for (const expression of templateJmespathExpressions) {
                validateJmespathExpressionReferences(
                    expression,
                    path,
                    againstScopeJsonSchema,
                );
            }
        }
        function validateExpressionReferences(
            expression: Expression,
            path: ValidatorDiagnostic["path"],
            againstScopeJsonSchema: RemoraflowType = scopeJsonSchema,
        ) {
            switch (expression.type) {
                case "jmespath": {
                    validateJmespathExpressionReferences(
                        expression.expression,
                        [...(path ?? []), "expression"],
                        againstScopeJsonSchema,
                    );
                    break;
                }
                case "template": {
                    validateTemplateStringReferences(
                        expression.template,
                        [...(path ?? []), "template"],
                        againstScopeJsonSchema,
                    );
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
                const conditionChainScope =
                    scopeSnapshots.nestedChainScopeByStepId.get(step.id);
                validateExpressionReferences(
                    step.params.condition,
                    ["steps", stepIndex, "params", "condition"],
                    conditionChainScope
                        ? scopeToJsonSchema(conditionChainScope)
                        : scopeJsonSchema,
                );
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
    validate: (workflowDefinition, { tools }) => {
        const diagnostics = validateVariableReferences(
            workflowDefinition,
            tools,
        );
        return { diagnostics };
    },
};

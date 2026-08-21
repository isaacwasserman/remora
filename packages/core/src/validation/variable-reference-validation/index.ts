import { asSchema } from "ai";
import type { JSONSchema7 } from "json-schema";
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
import {
    expressionReferences,
    nestedChainEntryPoints,
} from "../../step-registry";
import { assertNeverStep } from "../../step-types";
import type { ToolSet } from "../../types";
import { buildStepIndex } from "../../utils";
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
    let scopeCursor: TypeScope | null = scope;
    while (scopeCursor) {
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
    inputSchema?: JSONSchema7,
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
            if (step.params.accumulatorInitialValue) {
                return getExpressionType(
                    step.params.accumulatorInitialValue,
                    scope,
                );
            }
            return { type: "array" };
        }
        case "llm-prompt": {
            return step.params.outputFormat;
        }
        case "sleep": {
            return { type: "null" };
        }
        case "start": {
            return inputSchema ?? { type: "null" };
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
        case "while": {
            if (step.params.accumulatorInitialValue) {
                return getExpressionType(
                    step.params.accumulatorInitialValue,
                    scope,
                );
            }
            return { type: "array" };
        }
        default: {
            return assertNeverStep(step);
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

        const hasAccumulator = step.params.accumulatorName !== undefined;
        let accInitType: RemoraflowType | undefined;
        if (hasAccumulator && step.params.accumulatorInitialValue) {
            accInitType = getExpressionType(
                step.params.accumulatorInitialValue,
                scope,
            );
            // biome-ignore lint/style/noNonNullAssertion: <explanation>
            loopBindings.set(step.params.accumulatorName!, accInitType);
        }

        const loopScope: TypeScope = { parent: scope, bindings: loopBindings };

        const [bodyNode] = blockEntranceNodes(node);
        if (!bodyNode) return scope;
        const bodyEndScope = walkChain(bodyNode, loopScope);

        if (hasAccumulator && accInitType) {
            scope.bindings.set(node.stepId, accInitType);
        } else {
            scope.bindings.set(node.stepId, {
                type: "array",
                items: innermostBindingType(bodyEndScope),
            });
        }
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
    while: ({ node, step, scope, walkChain }) => {
        const [conditionNode, bodyNode] = blockEntranceNodes(node);

        const hasAccumulator = step.params.accumulatorName !== undefined;
        let accInitType: RemoraflowType | undefined;
        if (hasAccumulator && step.params.accumulatorInitialValue) {
            accInitType = getExpressionType(
                step.params.accumulatorInitialValue,
                scope,
            );
        }

        const accScope = (): TypeScope => {
            const bindings = new Map<string, RemoraflowType>();
            // biome-ignore lint/style/noNonNullAssertion: <explanation>
            bindings.set(step.params.accumulatorName!, accInitType!);
            return { parent: scope, bindings };
        };

        if (conditionNode) {
            walkChain(conditionNode, hasAccumulator ? accScope() : scope);
        }
        if (!bodyNode) return scope;
        const bodyEndScope = walkChain(
            bodyNode,
            hasAccumulator ? accScope() : scope,
        );

        if (hasAccumulator && accInitType) {
            scope.bindings.set(node.stepId, accInitType);
        } else {
            scope.bindings.set(node.stepId, {
                type: "array",
                items: innermostBindingType(bodyEndScope),
            });
        }
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
    inputSchema?: JSONSchema7,
): TypeScope {
    snapshots.byStepId.set(node.stepId, scope);
    const currentStep = stepsById.get(node.stepId) as WorkflowStep;
    const bindings = new Map<string, RemoraflowType>();
    bindings.set(
        node.stepId,
        getStepOutputType(currentStep, scope, tools, inputSchema),
    );
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
                    inputSchema,
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
        inputSchema,
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
    processChain(
        stepsById,
        stepGraph,
        initialScope,
        tools,
        snapshots,
        workflowDefinition.inputSchema,
    );
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
        for (const ref of expressionReferences(step)) {
            const refPath: ValidatorDiagnostic["path"] = [
                "steps",
                stepIndex,
                ...ref.path,
            ];
            if (ref.against === "nested-chain") {
                const conditionChainScope =
                    scopeSnapshots.nestedChainScopeByStepId.get(step.id);
                validateExpressionReferences(
                    ref.expression,
                    refPath,
                    conditionChainScope
                        ? scopeToJsonSchema(conditionChainScope)
                        : scopeJsonSchema,
                );
            } else {
                validateExpressionReferences(ref.expression, refPath);
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

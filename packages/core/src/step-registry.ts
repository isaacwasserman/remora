import { agentLoopExecutor } from "./execution/step-executors/agent-loop";
import { endExecutor } from "./execution/step-executors/end";
import { extractDataExecutor } from "./execution/step-executors/extract-data";
import { forEachExecutor } from "./execution/step-executors/for-each";
import { llmPromptExecutor } from "./execution/step-executors/llm-prompt";
import { requestInterventionExecutor } from "./execution/step-executors/request-intervention";
import { sleepExecutor } from "./execution/step-executors/sleep";
import { startExecutor } from "./execution/step-executors/start";
import { switchCaseExecutor } from "./execution/step-executors/switch-case";
import { toolCallExecutor } from "./execution/step-executors/tool-call";
import { waitForConditionExecutor } from "./execution/step-executors/wait-for-condition";
import { whileExecutor } from "./execution/step-executors/while";
import type { StepExecutor } from "./execution/types";
import type { Expression, WorkflowStep } from "./schema";
import type { StepOfType, StepType } from "./step-types";
import type { ResolvedRemoraflowSettings } from "./types";

export type { StepOfType, StepType } from "./step-types";
export { assertNeverStep, STEP_TYPES } from "./step-types";

export type NestedChain = {
    entryPointStepId: string;
    path: PropertyKey[];
    description: string;
    contributesOutput: boolean;
};

type NestedChainsByStepType = {
    [T in StepType]: (step: StepOfType<T>) => NestedChain[];
};

const nestedChainsByStepType: NestedChainsByStepType = {
    "for-each": (step) => [
        {
            entryPointStepId: step.params.loopBodyStepId,
            path: ["params", "loopBodyStepId"],
            description: `the loop body of for-each step "${step.id}"`,
            contributesOutput: true,
        },
    ],
    "switch-case": (step) =>
        step.params.cases.map((branchCase, caseIndex) => ({
            entryPointStepId: branchCase.branchBodyStepId,
            path: ["params", "cases", caseIndex, "branchBodyStepId"],
            description: `the branch body of case ${caseIndex} in switch-case step "${step.id}"`,
            contributesOutput: true,
        })),
    "wait-for-condition": (step) => [
        {
            entryPointStepId: step.params.conditionStepId,
            path: ["params", "conditionStepId"],
            description: `the condition chain of wait-for-condition step "${step.id}"`,
            contributesOutput: false,
        },
    ],
    while: (step) => [
        {
            entryPointStepId: step.params.conditionStepId,
            path: ["params", "conditionStepId"],
            description: `the condition chain of while step "${step.id}"`,
            contributesOutput: true,
        },
        {
            entryPointStepId: step.params.loopBodyStepId,
            path: ["params", "loopBodyStepId"],
            description: `the loop body of while step "${step.id}"`,
            contributesOutput: true,
        },
    ],
    "agent-loop": () => [],
    "request-intervention": () => [],
    "extract-data": () => [],
    "llm-prompt": () => [],
    "tool-call": () => [],
    end: () => [],
    sleep: () => [],
    start: () => [],
};

export function nestedChains(step: WorkflowStep): NestedChain[] {
    const chainsOf = nestedChainsByStepType[step.type] as (
        step: WorkflowStep,
    ) => NestedChain[];
    return chainsOf(step);
}

export function nestedChainEntryPoints(step: WorkflowStep): string[] {
    return nestedChains(step).map((chain) => chain.entryPointStepId);
}

export function isBlockStep(step: WorkflowStep): boolean {
    return nestedChains(step).length > 0;
}

export type StepExecutorMap = {
    [T in StepType]: StepExecutor<T>;
};

export const stepExecutors: StepExecutorMap = {
    "agent-loop": agentLoopExecutor,
    end: endExecutor,
    "extract-data": extractDataExecutor,
    "for-each": forEachExecutor,
    "llm-prompt": llmPromptExecutor,
    "request-intervention": requestInterventionExecutor,
    sleep: sleepExecutor,
    start: startExecutor,
    "switch-case": switchCaseExecutor,
    "tool-call": toolCallExecutor,
    "wait-for-condition": waitForConditionExecutor,
    while: whileExecutor,
};

export type ToolReference = {
    toolName: string;
    path: PropertyKey[];
};

type ToolReferencesByStepType = {
    [T in StepType]: (step: StepOfType<T>) => ToolReference[];
};

const toolReferencesByStepType: ToolReferencesByStepType = {
    "tool-call": (step) => [
        { toolName: step.params.toolName, path: ["params", "toolName"] },
    ],
    "agent-loop": (step) =>
        step.params.tools.map((toolName, toolIndex) => ({
            toolName,
            path: ["params", "tools", toolIndex],
        })),
    end: () => [],
    "extract-data": () => [],
    "for-each": () => [],
    "llm-prompt": () => [],
    "request-intervention": () => [],
    sleep: () => [],
    start: () => [],
    "switch-case": () => [],
    "wait-for-condition": () => [],
    while: () => [],
};

export function toolReferences(step: WorkflowStep): ToolReference[] {
    const refsOf = toolReferencesByStepType[step.type] as (
        step: WorkflowStep,
    ) => ToolReference[];
    return refsOf(step);
}

export type ExpressionReference = {
    expression: Expression;
    path: PropertyKey[];
    against?: "nested-chain";
};

type ExpressionReferencesByStepType = {
    [T in StepType]: (step: StepOfType<T>) => ExpressionReference[];
};

const expressionReferencesByStepType: ExpressionReferencesByStepType = {
    "agent-loop": (step) => [
        {
            expression: {
                type: "template",
                template: step.params.instructions,
            },
            path: ["params", "instructions"],
        },
    ],
    end: (step) =>
        step.params?.output
            ? [{ expression: step.params.output, path: ["params", "output"] }]
            : [],
    "extract-data": (step) => [
        { expression: step.params.sourceData, path: ["params", "sourceData"] },
    ],
    "for-each": (step) => {
        const refs: ExpressionReference[] = [
            { expression: step.params.target, path: ["params", "target"] },
        ];
        if (step.params.accumulatorInitialValue) {
            refs.push({
                expression: step.params.accumulatorInitialValue,
                path: ["params", "accumulatorInitialValue"],
            });
        }
        return refs;
    },
    "llm-prompt": (step) => [
        {
            expression: { type: "template", template: step.params.prompt },
            path: ["params", "prompt"],
        },
    ],
    sleep: (step) => [
        { expression: step.params.durationMs, path: ["params", "durationMs"] },
    ],
    "switch-case": (step) => [
        { expression: step.params.switchOn, path: ["params", "switchOn"] },
        ...step.params.cases.flatMap((branchCase, caseIndex) =>
            branchCase.value.type === "default"
                ? []
                : [
                      {
                          expression: branchCase.value,
                          path: ["params", "cases", caseIndex, "value"],
                      } satisfies ExpressionReference,
                  ],
        ),
    ],
    "tool-call": (step) =>
        Object.entries(step.params.toolInput).map(
            ([paramName, expression]) => ({
                expression,
                path: ["params", "toolInput", paramName],
            }),
        ),
    "wait-for-condition": (step) => {
        const refs: ExpressionReference[] = [
            {
                expression: step.params.condition,
                path: ["params", "condition"],
                against: "nested-chain",
            },
        ];
        if (step.params.backoffMultiplier) {
            refs.push({
                expression: step.params.backoffMultiplier,
                path: ["params", "backoffMultiplier"],
            });
        }
        if (step.params.intervalMs) {
            refs.push({
                expression: step.params.intervalMs,
                path: ["params", "intervalMs"],
            });
        }
        if (step.params.maxAttempts) {
            refs.push({
                expression: step.params.maxAttempts,
                path: ["params", "maxAttempts"],
            });
        }
        if (step.params.timeoutMs) {
            refs.push({
                expression: step.params.timeoutMs,
                path: ["params", "timeoutMs"],
            });
        }
        return refs;
    },
    start: () => [],
    while: (step) => {
        if (!step.params.accumulatorInitialValue) return [];
        return [
            {
                expression: step.params.accumulatorInitialValue,
                path: ["params", "accumulatorInitialValue"],
            },
        ];
    },
    "request-intervention": () => [],
};

export function expressionReferences(
    step: WorkflowStep,
): ExpressionReference[] {
    const refsOf = expressionReferencesByStepType[step.type] as (
        step: WorkflowStep,
    ) => ExpressionReference[];
    return refsOf(step);
}

export type { StepExecutor, StepExecutorArgs } from "./execution/types";

export type ConstrainedParameter = {
    path: readonly PropertyKey[];
    bound: {
        source: "duration-limits" | "token-budgets";
        key: string;
    };
    direction: "max" | "min";
    multiplier: number;
};

const CONSTRAINED_PARAMETERS: Record<StepType, ConstrainedParameter[]> = {
    sleep: [
        {
            path: ["params", "durationMs"],
            bound: { source: "duration-limits", key: "maxSleepSeconds" },
            direction: "max",
            multiplier: 1000,
        },
    ],
    "wait-for-condition": [
        {
            path: ["params", "intervalMs"],
            bound: {
                source: "duration-limits",
                key: "minPollIntervalSeconds",
            },
            direction: "min",
            multiplier: 1000,
        },
        {
            path: ["params", "timeoutMs"],
            bound: { source: "duration-limits", key: "maxWaitSeconds" },
            direction: "max",
            multiplier: 1000,
        },
    ],
    "agent-loop": [
        {
            path: ["params", "maxSteps"],
            bound: { source: "token-budgets", key: "maxAgentSteps" },
            direction: "max",
            multiplier: 1,
        },
    ],
    end: [],
    "extract-data": [],
    "for-each": [],
    "llm-prompt": [],
    "request-intervention": [],
    start: [],
    "switch-case": [],
    "tool-call": [],
    while: [],
};

export function constrainedParameters(
    step: WorkflowStep,
): ConstrainedParameter[] {
    return (
        (CONSTRAINED_PARAMETERS as Record<string, ConstrainedParameter[]>)[
            step.type
        ] ?? []
    );
}

type FeatureKey = keyof ResolvedRemoraflowSettings["features"];

const REQUIRED_FEATURES: Record<StepType, readonly FeatureKey[]> = {
    "agent-loop": ["allowAgentLoops"],
    "request-intervention": ["allowUserIntervention"],
    end: [],
    "extract-data": [],
    "for-each": [],
    "llm-prompt": [],
    sleep: [],
    start: [],
    "switch-case": [],
    "tool-call": [],
    "wait-for-condition": [],
    while: [],
};

export function requiredFeatures(step: WorkflowStep): readonly FeatureKey[] {
    return (
        (REQUIRED_FEATURES as Record<string, readonly FeatureKey[]>)[
            step.type
        ] ?? []
    );
}

export function isStepTypeAllowed(
    stepType: string,
    features: ResolvedRemoraflowSettings["features"],
): boolean {
    const required =
        (REQUIRED_FEATURES as Record<string, readonly FeatureKey[]>)[
            stepType
        ] ?? [];
    return required.every((feat) => features[feat]);
}

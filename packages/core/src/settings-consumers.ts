import type { ResolvedRemoraflowSettings } from "./types";

export type SettingsConsumer = {
    module: string;
    role: string;
};

export type SettingsFieldDeclaration = {
    path: readonly string[];
    consumers: readonly SettingsConsumer[];
    intentionallyUnconsumed?: boolean;
};

type FeatureKey = keyof ResolvedRemoraflowSettings["features"];
type DurationKey = keyof ResolvedRemoraflowSettings["duration"];
type StepRetryKey = keyof ResolvedRemoraflowSettings["stepRetry"];
type TokenBudgetsKey = keyof ResolvedRemoraflowSettings["tokenBudgets"];
type StructuralLimitsKey = keyof ResolvedRemoraflowSettings["structuralLimits"];
type LogLimitsKey = keyof ResolvedRemoraflowSettings["logLimits"];
type ToolExecutionLimitsKey =
    keyof ResolvedRemoraflowSettings["toolExecutionLimits"];

const FEATURES: Record<FeatureKey, SettingsFieldDeclaration> = {
    allowUserIntervention: {
        path: ["features", "allowUserIntervention"],
        consumers: [
            {
                module: "schema",
                role: "exclude request-intervention step type",
            },
            { module: "run-workflow", role: "defense-in-depth guard" },
        ],
    },
    allowAgentLoops: {
        path: ["features", "allowAgentLoops"],
        consumers: [
            { module: "schema", role: "exclude agent-loop step type" },
            { module: "run-workflow", role: "defense-in-depth guard" },
        ],
    },
};

const DURATION: Record<DurationKey, SettingsFieldDeclaration> = {
    maxDurationSeconds: {
        path: ["duration", "maxDurationSeconds"],
        consumers: [
            { module: "duration-budget", role: "run wall-clock budget" },
        ],
    },
    maxExecutionSeconds: {
        path: ["duration", "maxExecutionSeconds"],
        consumers: [
            { module: "duration-budget", role: "execution-clock budget" },
        ],
    },
    maxWaitSeconds: {
        path: ["duration", "maxWaitSeconds"],
        consumers: [
            { module: "duration-policy", role: "compose maxSleepSeconds" },
            { module: "schema", role: "narrow wait-for-condition.timeoutMs" },
            {
                module: "execution-context",
                role: "clamp waitFor maxWaitSeconds",
            },
        ],
    },
    maxSleepSeconds: {
        path: ["duration", "maxSleepSeconds"],
        consumers: [
            { module: "duration-policy", role: "resolved bound" },
            { module: "schema", role: "narrow sleep.durationMs" },
            { module: "execution-context", role: "clamp sleepStep" },
        ],
    },
    maxStepExecutionSeconds: {
        path: ["duration", "maxStepExecutionSeconds"],
        consumers: [{ module: "execution-context", role: "per-step timeout" }],
    },
    minPollIntervalSeconds: {
        path: ["duration", "minPollIntervalSeconds"],
        consumers: [
            { module: "schema", role: "narrow wait-for-condition.intervalMs" },
            { module: "execution-context", role: "floor poll interval" },
        ],
    },
};

const STEP_RETRY: Record<StepRetryKey, SettingsFieldDeclaration> = {
    maxAttempts: {
        path: ["stepRetry", "maxAttempts"],
        consumers: [
            { module: "execution-context", role: "default retry attempts" },
        ],
    },
    retryDelaySeconds: {
        path: ["stepRetry", "retryDelaySeconds"],
        consumers: [
            { module: "execution-context", role: "default retry delay" },
        ],
    },
    shouldRetry: {
        path: ["stepRetry", "shouldRetry"],
        consumers: [{ module: "execution-context", role: "retry predicate" }],
    },
};

const TOKEN_BUDGETS: Record<TokenBudgetsKey, SettingsFieldDeclaration> = {
    maxDataTokens: {
        path: ["tokenBudgets", "maxDataTokens"],
        consumers: [
            { module: "extract-data", role: "data comprehension budget" },
        ],
    },
    maxAgentSteps: {
        path: ["tokenBudgets", "maxAgentSteps"],
        consumers: [
            { module: "agent-loop", role: "step budget" },
            { module: "extract-data", role: "step budget" },
            { module: "schema", role: "narrow agent-loop.maxSteps" },
        ],
    },
    maxContextTokens: {
        path: ["tokenBudgets", "maxContextTokens"],
        consumers: [
            { module: "agent-loop", role: "maxInputTokens for LLM call" },
        ],
    },
};

const STRUCTURAL_LIMITS: Record<StructuralLimitsKey, SettingsFieldDeclaration> =
    {
        maxSteps: {
            path: ["structuralLimits", "maxSteps"],
            consumers: [
                {
                    module: "structural-limit-validation",
                    role: "reject oversize workflows",
                },
            ],
        },
        maxNestingDepth: {
            path: ["structuralLimits", "maxNestingDepth"],
            consumers: [
                {
                    module: "structural-limit-validation",
                    role: "reject deep nesting",
                },
            ],
        },
        maxLoopIterations: {
            path: ["structuralLimits", "maxLoopIterations"],
            consumers: [
                { module: "for-each", role: "reject oversized iterators" },
                { module: "while", role: "stop runaway loops" },
            ],
        },
    };

const LOG_LIMITS: Record<LogLimitsKey, SettingsFieldDeclaration> = {
    maxLogLineLength: {
        path: ["logLimits", "maxLogLineLength"],
        consumers: [{ module: "logger", role: "truncate long log lines" }],
    },
    maxLogLines: {
        path: ["logLimits", "maxLogLines"],
        consumers: [{ module: "logger", role: "ring buffer size" }],
    },
};

const TOOL_EXECUTION_LIMITS: Record<
    ToolExecutionLimitsKey,
    SettingsFieldDeclaration
> = {
    maxToolOutputBytes: {
        path: ["toolExecutionLimits", "maxToolOutputBytes"],
        consumers: [
            { module: "tool-runner", role: "truncate oversized tool outputs" },
        ],
    },
};

type TopLevelCategory = keyof ResolvedRemoraflowSettings;

type _CategoriesWithSubRecords = {
    features: typeof FEATURES;
    duration: typeof DURATION;
    stepRetry: typeof STEP_RETRY;
    tokenBudgets: typeof TOKEN_BUDGETS;
    structuralLimits: typeof STRUCTURAL_LIMITS;
    logLimits: typeof LOG_LIMITS;
    toolExecutionLimits: typeof TOOL_EXECUTION_LIMITS;
};
type _MissingCategories = Exclude<
    TopLevelCategory,
    keyof _CategoriesWithSubRecords
>;
type _ExtraCategories = Exclude<
    keyof _CategoriesWithSubRecords,
    TopLevelCategory
>;
type _CategoriesExhaustive = [_MissingCategories] extends [never]
    ? [_ExtraCategories] extends [never]
        ? true
        : "A sub-record exists for a settings category that does not exist — remove it"
    : "A settings category has no sub-record in SETTINGS_CONSUMERS — add one";
const _categoriesCheck: _CategoriesExhaustive = true;
void _categoriesCheck;

export const SETTINGS_CONSUMERS = {
    ...FEATURES,
    ...DURATION,
    ...STEP_RETRY,
    ...TOKEN_BUDGETS,
    ...STRUCTURAL_LIMITS,
    ...LOG_LIMITS,
    ...TOOL_EXECUTION_LIMITS,
} as const;

export type SettingsFieldPath = keyof typeof SETTINGS_CONSUMERS;

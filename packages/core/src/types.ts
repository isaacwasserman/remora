/** biome-ignore-all lint/suspicious/noExplicitAny: Needed for proper inference. */
import type { Schema } from "@ai-sdk/provider-utils";
import { type LanguageModel as AnyLanguageModel, asSchema } from "ai";
import { type } from "arktype";
import type * as z3 from "zod/v3";
import type * as z4 from "zod/v4";
import type { StandardJSONSchemaV1, StandardSchemaV1 } from "./schemistry";

type LazySchema<SCHEMA> = () => Schema<SCHEMA>;
type ZodSchema<SCHEMA = any> =
    | z3.Schema<SCHEMA, z3.ZodTypeDef, any>
    | z4.core.$ZodType<SCHEMA, any>;
type StandardSchema<SCHEMA = any> = StandardSchemaV1<unknown, SCHEMA> &
    StandardJSONSchemaV1<unknown, SCHEMA>;
type FlexibleSchema<SCHEMA = any> =
    | Schema<SCHEMA>
    | LazySchema<SCHEMA>
    | ZodSchema<SCHEMA>
    | StandardSchema<SCHEMA>;
type InferSchema<S> =
    S extends Schema<infer T>
        ? T
        : S extends LazySchema<infer T>
          ? T
          : S extends StandardSchemaV1<unknown, infer T>
            ? T
            : S extends z4.core.$ZodType<infer T, any>
              ? T
              : S extends z3.Schema<infer T, any, any>
                ? T
                : unknown;

export type ToolSchema<TSchema> = FlexibleSchema<TSchema>;

export type ToolExecutionOptions = {
    toolCallId: string;
    messages: never[];
};

export type Tool<
    TInputSchema extends ToolSchema<any> = ToolSchema<never>,
    TOutputSchema extends ToolSchema<any> = ToolSchema<never>,
> = {
    inputSchema: TInputSchema;
    outputSchema?: TOutputSchema;
    execute?: (
        input: InferSchema<TInputSchema>,
        options: ToolExecutionOptions,
    ) =>
        | AsyncIterable<InferSchema<TOutputSchema>>
        | PromiseLike<InferSchema<TOutputSchema>>
        | InferSchema<TOutputSchema>;
};

/**
 * Like {@link FlexibleSchema}, but without requiring the optional
 * standard-schema JSON Schema extension.
 */
type AnyToolSchema =
    | Schema<any>
    | LazySchema<any>
    | ZodSchema<any>
    | StandardSchemaV1<unknown, any>;

/**
 * A tool with its schema types erased, for use in heterogeneous collections
 * such as {@link ToolSet}. Author individual tools as {@link Tool} (or via the
 * `ai` SDK's `tool()`), which preserves their types.
 */
export type AnyTool = {
    inputSchema: AnyToolSchema;
    outputSchema?: AnyToolSchema;
    execute?: (input: any, options: any) => any;
    description?: string;
};
export type AnyStubbedTool = {
    inputSchema: AnyToolSchema;
    outputSchema?: AnyToolSchema;
    description?: string;
};

export type ToolSet = Record<string, AnyTool>;

export type StubbedToolSet = Record<string, AnyStubbedTool>;

export type LanguageModel = Exclude<AnyLanguageModel, string>;

export type ModelSet = Record<string, LanguageModel>;

export type AgentConfig = { tools: ToolSet; model: LanguageModel };

export type ServiceResult<T, E extends string = never> =
    | { data: T; error: null }
    | { data: null; error: E; message: string };

export function success(): { data: undefined; error: null };
export function success<T>(data: T): { data: T; error: null };
export function success<T>(data?: T) {
    return { data, error: null };
}

export function failure<E extends string>(
    error: E,
    message: string,
): { data: null; error: E; message: string } {
    return { data: null, error, message };
}

export function unknownFailure(
    error: unknown,
): ServiceResult<never, "UNKNOWN"> {
    return failure(
        "UNKNOWN",
        error instanceof Error ? error.message : String(error),
    );
}

const featuresSchema = type({
    allowUserIntervention: [
        ["boolean", "@", 'whether to allow "request-intervention" steps'],
        "=",
        false,
    ],
    allowAgentLoops: [
        ["boolean", "@", 'whether to allow "agent-loop" steps'],
        "=",
        true,
    ],
});

const durationSchema = type({
    maxDurationSeconds: [
        [
            "number > 0",
            "@",
            "maximum duration of a given workflow including waiting periods",
        ],
        "=",
        60 * 60 * 24 * 365,
    ],
    maxExecutionSeconds: [
        [
            "number > 0",
            "@",
            "maximum duration of a given workflow excluding waiting periods but including polling execution time",
        ],
        "=",
        60 * 60,
    ],
    maxWaitSeconds: [
        [
            "number > 0",
            "@",
            "maximum combined wait time for any one wait-for-condition step",
        ],
        "=",
        60 * 60 * 24,
    ],
    maxSleepSeconds: [
        ["number > 0", "@", "maximum duration of any one sleep step"],
        "=",
        60 * 60 * 24,
    ],
    maxStepExecutionSeconds: [
        [
            "number > 0",
            "@",
            "maximum execution time for any one step, excluding wait time",
        ],
        "=",
        60 * 60,
    ],
    minPollIntervalSeconds: [
        [
            "number >= 0",
            "@",
            "minimum time between polling wait-for-condition polling runs",
        ],
        "=",
        60,
    ],
});

const stepRetrySchema = type({
    maxAttempts: [
        [
            "number.integer",
            "@",
            "how many attempts to give each durable step after a recoverable error",
        ],
        "=",
        1,
    ],
    retryDelaySeconds: [
        [
            "number >= 0",
            "@",
            "how many seconds to wait between durable step retry attempts",
        ],
        "=",
        5,
    ],
    "shouldRetry?": type("Function").as<(errorMessage: string) => boolean>(),
});

const tokenBudgetsSchema = type({
    maxDataTokens: [
        [
            "number.integer > 0",
            "@",
            "maximum number of tokens worth of data to present to the llm at one time before summarizing/truncating",
        ],
        "=",
        8192,
    ],
    maxAgentSteps: [
        [
            "number.integer >= 2",
            "@",
            "maximum number of steps that an agent may take to produce its final output",
        ],
        "=",
        16,
    ],
    maxContextTokens: [
        [
            "number.integer >= 0",
            "@",
            "maximum length of context given to LLM before truncation",
        ],
        "=",
        128_000,
    ],
});

const structuralLimitsSchema = type({
    maxSteps: [
        [
            "number.integer >= 0",
            "@",
            "maximum number of steps that a workflow may contain (0 for unlimited)",
        ],
        "=",
        0,
    ],
    maxNestingDepth: [
        [
            "number.integer >= 0",
            "@",
            "maximum nesting depth of steps within bodies of for-each and switch-case steps (0 for unlimited)",
        ],
        "=",
        0,
    ],
    maxLoopIterations: [
        [
            "number.integer >= 0",
            "@",
            "maximum number of iterations that a for-each step may have (0 for unlimited)",
        ],
        "=",
        0,
    ],
});

const logLimitsSchema = type({
    maxLogLineLength: [
        [
            "number.integer >= 0",
            "@",
            "maximum length of a log line that will be captured in the output before truncating",
        ],
        "=",
        4096,
    ],
    maxLogLines: [
        [
            "number.integer >= 0",
            "@",
            "maximum number of log lines that will be captured in the output before recycling earlier logs (0 for unlimited)",
        ],
        "=",
        4096,
    ],
});

const toolExecutionLimitsSchema = type({
    maxToolOutputBytes: [
        ["number.integer >= 0", "@", "maximum size of any given tool output"],
        "=",
        1024 * 1024 * 5,
    ],
});

export const remoraflowSettingsSchema = type({
    features: featuresSchema.default(() => featuresSchema.assert({})),
    duration: durationSchema.default(() => durationSchema.assert({})),
    stepRetry: stepRetrySchema.default(() => stepRetrySchema.assert({})),
    tokenBudgets: tokenBudgetsSchema.default(() =>
        tokenBudgetsSchema.assert({}),
    ),
    structuralLimits: structuralLimitsSchema.default(() =>
        structuralLimitsSchema.assert({}),
    ),
    logLimits: logLimitsSchema.default(() => logLimitsSchema.assert({})),
    toolExecutionLimits: toolExecutionLimitsSchema.default(() =>
        toolExecutionLimitsSchema.assert({}),
    ),
});

export type RemoraflowSettings = typeof remoraflowSettingsSchema.inferIn;
export type ResolvedRemoraflowSettings =
    typeof remoraflowSettingsSchema.inferOut;

/** The `features` subset of {@link ResolvedRemoraflowSettings} — feature flags
 * that gate which step types a workflow may contain. */
export type RemoraflowFeatures = ResolvedRemoraflowSettings["features"];

export type { ExecutionState } from "./execution/types";

export interface ToolSchemaDefinition {
    displayName?: string;
    description?: string;
    inputSchema: {
        required?: string[];
        properties?: Record<string, unknown>;
    };
    outputSchema?: Record<string, unknown>;
}

export type ToolDefinitionMap = Record<string, ToolSchemaDefinition>;

export async function extractToolSchemas(
    tools: ToolSet,
): Promise<ToolDefinitionMap> {
    const schemas: ToolDefinitionMap = {};
    for (const [name, toolDef] of Object.entries(tools)) {
        schemas[name] = {
            description: toolDef.description,
            inputSchema: asSchema(toolDef.inputSchema)
                .jsonSchema as ToolSchemaDefinition["inputSchema"],
        };
        if (toolDef.outputSchema) {
            schemas[name].outputSchema = asSchema(toolDef.outputSchema)
                .jsonSchema as Record<string, unknown>;
        }
    }
    return schemas;
}

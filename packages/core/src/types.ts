/** biome-ignore-all lint/suspicious/noExplicitAny: Needed for proper inference. */
import type { Schema } from "@ai-sdk/provider-utils";
import type { LanguageModel as AnyLanguageModel } from "ai";
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
};

export type ToolSet = Record<string, AnyTool>;

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

const durationPolicySchema = type({
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

const stepRetryPolicySchema = type({
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

const tokenUsageSchema = type({
    "input?": ["number.integer >= 0"],
    "output?": ["number.integer >= 0"],
    "total?": ["number.integer >= 0"],
});

const tokenBudgetPolicySchema = type({
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
    "maxStepTokenUsage?": [
        tokenUsageSchema,
        "@",
        "how many tokens may be used by any given step",
    ],
    "maxTotalTokenUsage?": [
        tokenUsageSchema,
        "@",
        "how many tokens may be used by a given run",
    ],
});

export const remoraflowOptionsSchema = type({
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
    durationPolicy: durationPolicySchema.default(() =>
        durationPolicySchema.assert({}),
    ),
    stepRetryPolicy: stepRetryPolicySchema.default(() =>
        stepRetryPolicySchema.assert({}),
    ),
    tokenBudgetPolicy: tokenBudgetPolicySchema.default(() =>
        tokenBudgetPolicySchema.assert({}),
    ),
    maxToolOutputBytes: [
        ["number.integer >= 0", "@", "maximum size of any given tool output"],
        "=",
        1024 * 1024 * 5,
    ],
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
            "maximum number of log lines that will be captured in the output before recycling earlier logs",
        ],
        "=",
        4096,
    ],
});

export type RemoraflowOptions = typeof remoraflowOptionsSchema.inferIn;
export type ResolvedRemoraflowOptions = typeof remoraflowOptionsSchema.inferOut;

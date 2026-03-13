# Execution

The executor walks a compiled workflow's step graph from `initialStepId` to completion, handling tool calls, LLM prompts, data extraction, branching, loops, and more. It supports execution callbacks, automatic retry with exponential backoff, configurable resource limits, and durable execution contexts.

```ts
import { compileWorkflow, executeWorkflow } from "@isaacwasserman/remora";

const compiled = await compileWorkflow(workflow, { tools });

if (compiled.workflow) {
  const result = await executeWorkflow(compiled.workflow, {
    tools,
    model: myModel,
    inputs: { userId: "u_123" },
  });

  if (result.success) {
    console.log("Output:", result.output);
  }
}
```

## Execution Options

`executeWorkflow` accepts a workflow definition and an options object:

```ts
interface ExecuteWorkflowOptions {
  tools: ToolSet;
  model?: LanguageModel;
  agent?: Agent;
  inputs?: Record<string, unknown>;
  maxRetries?: number;
  retryDelayMs?: number;
  onStepStart?: (stepId: string, step: WorkflowStep) => void;
  onStepComplete?: (stepId: string, output: unknown) => void;
  onStateChange?: (state: ExecutionState, delta: ExecutionDelta) => void;
  context?: DurableContext;
  limits?: ExecutorLimits;
}
```

### `tools` (required)

**Type:** `ToolSet` (from the [AI SDK](https://ai-sdk.dev/))

Every tool referenced by a `tool-call` or `agent-loop` step must be present in this set with an `execute` function. The executor validates this before running any steps.

```ts
import { tool } from "ai";
import { z } from "zod";

const tools = {
  "get-user": tool({
    parameters: z.object({ id: z.string() }),
    execute: async ({ id }) => {
      return await db.users.findById(id);
    },
  }),
};
```

### `model`

**Type:** `LanguageModel` (from the [AI SDK](https://ai-sdk.dev/))
**Default:** `undefined`

Required if the workflow contains `llm-prompt`, `extract-data`, or `agent-loop` steps. A language model used by `llm-prompt`, `extract-data`, and `agent-loop` steps for generation and structured output coercion.

```ts
import { anthropic } from "@ai-sdk/anthropic";

// Required for any LLM steps
const result = await executeWorkflow(workflow, {
  tools,
  model: anthropic("claude-sonnet-4-20250514"),
});
```

### `agent`

**Type:** `Agent` (from the [AI SDK](https://ai-sdk.dev/))
**Default:** `undefined`

Optional. When provided, `agent-loop` steps use this Agent directly with its own tools and behaviors, instead of creating a `ToolLoopAgent` from the `model`. The Agent generates text output, which is then coerced into the expected structured format using the bare `model` with `Output.object()`.

```ts
import { anthropic } from "@ai-sdk/anthropic";

const agent = new MyCustomAgent({
  tools: myAgentTools,
  model: anthropic("claude-sonnet-4-20250514"),
});

// agent-loop steps will use myAgent instead of creating a ToolLoopAgent from model
const result = await executeWorkflow(workflow, {
  tools,
  model: anthropic("claude-sonnet-4-20250514"),
  agent: agent,
});
```

### `inputs`

**Type:** `Record<string, unknown>`
**Default:** `{}`

Input values passed to the workflow. If the workflow has a `start` step with an `inputSchema`, the inputs are validated against it before execution begins. Inputs are accessible in JMESPath expressions via `input.fieldName`.

```ts
const result = await executeWorkflow(workflow, {
  tools,
  inputs: {
    userId: "u_123",
    priority: "high",
  },
});
```

### `maxRetries`

**Type:** `number`
**Default:** `3`

Maximum number of retry attempts for [recoverable errors](#automatic-retry). Each retry uses exponential backoff with the base delay set by `retryDelayMs`.

### `retryDelayMs`

**Type:** `number`
**Default:** `1000`

Base delay in milliseconds for exponential backoff between retries. The actual delay for attempt `n` is `retryDelayMs * 2^(n-1)`:

| Attempt | Delay (default) |
|---|---|
| 1 | 1,000 ms |
| 2 | 2,000 ms |
| 3 | 4,000 ms |

## Execution Callbacks

Three callbacks let you observe execution as it happens.

### `onStepStart`

**Type:** `(stepId: string, step: WorkflowStep) => void`

Called immediately before a step begins execution. Useful for logging or progress indicators:

```ts
const result = await executeWorkflow(workflow, {
  tools,
  onStepStart: (stepId, step) => {
    console.log(`Starting step "${step.name}" (${step.type})`);
  },
});
```

### `onStepComplete`

**Type:** `(stepId: string, output: unknown) => void`

Called after a step completes successfully, with the step's output value:

```ts
const result = await executeWorkflow(workflow, {
  tools,
  onStepComplete: (stepId, output) => {
    console.log(`Step "${stepId}" produced:`, output);
  },
});
```

### `onStateChange`

**Type:** `(state: ExecutionState, delta: ExecutionDelta) => void`

Called on every state transition with the full execution state and the delta that produced it. This is the most powerful callback — it gives you a complete, serializable view of execution progress. See [Execution State](/guide/execution-state) for details on the state model.

```ts
const history: ExecutionDelta[] = [];

const result = await executeWorkflow(workflow, {
  tools,
  onStateChange: (state, delta) => {
    history.push(delta);

    // React to specific transitions
    if (delta.type === "step-failed") {
      console.error(`Step "${delta.stepId}" failed:`, delta.error.message);
    }
    if (delta.type === "step-retry") {
      console.warn(`Retrying step "${delta.stepId}", attempt ${delta.retry.attempt}`);
    }
  },
});

// history now contains the full sequence of state transitions
```

::: tip
`onStepStart` and `onStepComplete` are convenience callbacks for simple logging. For full observability, use `onStateChange` — it captures starts, completions, failures, retries, and run-level events in a single callback.
:::

## Execution Result

`executeWorkflow` returns an `ExecutionResult`:

```ts
interface ExecutionResult {
  success: boolean;
  stepOutputs: Record<string, unknown>;
  output?: unknown;
  error?: StepExecutionError;
  executionState: ExecutionState;
}
```

### `success`

`true` if the workflow ran to completion without errors. `false` if any step failed after exhausting retries.

### `stepOutputs`

A map from step ID to that step's output value. This includes outputs from every step that executed, including intermediate steps. It also contains `input` as a key, holding the workflow's input values.

```ts
const result = await executeWorkflow(workflow, { tools, inputs: { userId: "u_123" } });

// Access any step's output by ID
const userData = result.stepOutputs["fetch_user"];
const classification = result.stepOutputs["classify"];

// Workflow inputs are also available
const inputs = result.stepOutputs["input"]; // { userId: "u_123" }
```

### `output`

The workflow's final output value, produced by the `end` step's `output` expression. If the `end` step has no output expression, this is `undefined`.

If the workflow defines an `outputSchema`, the output is validated against it before being returned. A validation failure sets `success` to `false`.

### `error`

The `StepExecutionError` that caused the workflow to fail, if `success` is `false`. See [Error Handling](#error-handling) for error classes and codes.

```ts
if (!result.success) {
  console.error(`Failed at step "${result.error?.stepId}"`);
  console.error(`Error code: ${result.error?.code}`);
  console.error(`Category: ${result.error?.category}`);
  console.error(`Message: ${result.error?.message}`);
}
```

### `executionState`

The final [`ExecutionState`](/guide/execution-state) snapshot after the run completes. Contains the full execution history including all step records, timings, outputs, errors, and retry attempts.

## Executor Limits

Runtime resource limits that bound execution time and constrain sleep/wait parameters. These are enforced during execution, complementing the [compiler limits](/guide/compilation#limits) which validate at compile time.

```ts
interface ExecutorLimits {
  maxTotalMs?: number;
  maxActiveMs?: number;
  maxSleepMs?: number;
  maxAttempts?: number;
  maxBackoffMultiplier?: number;
  minBackoffMultiplier?: number;
  maxTimeoutMs?: number;
  probeThresholdBytes?: number;
  probeResultMaxBytes?: number;
  probeMaxSteps?: number;
}
```

| Field | Default | Description |
|---|---|---|
| `maxTotalMs` | `600_000` (10 min) | Wall-clock time limit from start to finish, including sleeps and waits |
| `maxActiveMs` | `300_000` (5 min) | Active execution time limit (step execution only, excluding sleeps/waits) |
| `maxSleepMs` | `300_000` (5 min) | Soft cap on `sleep` `durationMs` and `wait-for-condition` `intervalMs`. Values are clamped silently |
| `maxAttempts` | `Infinity` | Soft cap on `wait-for-condition` `maxAttempts`. Clamped silently |
| `maxBackoffMultiplier` | `2` | Upper bound for `backoffMultiplier`. Clamped silently |
| `minBackoffMultiplier` | `1` | Lower bound for `backoffMultiplier`. Clamped silently |
| `maxTimeoutMs` | `600_000` (10 min) | Soft cap on `wait-for-condition` `timeoutMs`. Clamped silently |
| `probeThresholdBytes` | `50_000` (50 KB) | Byte threshold above which `extract-data` uses probe mode instead of inline |
| `probeResultMaxBytes` | `10_000` (10 KB) | Maximum bytes returned per probe-data call in probe mode |
| `probeMaxSteps` | `10` | Maximum probe steps for `extract-data` probe mode |

```ts
const result = await executeWorkflow(workflow, {
  tools,
  limits: {
    maxTotalMs: 120_000,     // 2-minute wall-clock limit
    maxActiveMs: 60_000,     // 1-minute active execution limit
    maxSleepMs: 30_000,      // Cap individual sleeps to 30 seconds
  },
});
```

When a timeout is hit, the executor throws an `ExternalServiceError` with code `EXECUTION_TOTAL_TIMEOUT` or `EXECUTION_ACTIVE_TIMEOUT`.

## Error Handling

All executor errors extend `StepExecutionError`, which carries the step ID, error code, error category, and optional cause:

```ts
class StepExecutionError extends Error {
  readonly stepId: string;
  readonly code: ErrorCode;
  readonly category: ErrorCategory;
  readonly cause?: unknown;
}
```

### Error Categories

| Category | Description | Retryable? |
|---|---|---|
| `configuration` | Workflow is misconfigured (missing tools, no agent) | No |
| `validation` | Input or output data doesn't match the expected schema | No |
| `external-service` | A tool or LLM call failed | Sometimes |
| `expression` | A JMESPath or template expression failed to evaluate | No |
| `output-quality` | The LLM produced output that couldn't be parsed | Yes |

### Error Classes

Each category has a corresponding class:

| Class | Category | Extra Fields |
|---|---|---|
| `ConfigurationError` | `configuration` | — |
| `ValidationError` | `validation` | `input` |
| `ExternalServiceError` | `external-service` | `statusCode`, `isRetryable` |
| `ExpressionError` | `expression` | `expression` |
| `OutputQualityError` | `output-quality` | `rawOutput` |
| `ExtractionError` | `output-quality` | `reason` |

### Error Codes

| Code | Category | Description |
|---|---|---|
| `TOOL_NOT_FOUND` | configuration | Referenced tool doesn't exist in the `ToolSet` |
| `TOOL_MISSING_EXECUTE` | configuration | Tool exists but has no `execute` function |
| `AGENT_NOT_PROVIDED` | configuration | Workflow has LLM steps but no `model` was provided |
| `TOOL_INPUT_VALIDATION_FAILED` | validation | Tool input doesn't match the expected schema |
| `FOREACH_TARGET_NOT_ARRAY` | validation | `for-each` target resolved to a non-array value |
| `WORKFLOW_OUTPUT_VALIDATION_FAILED` | validation | Final output doesn't match the workflow's `outputSchema` |
| `TOOL_EXECUTION_FAILED` | external-service | Tool's `execute` function threw an error |
| `LLM_API_ERROR` | external-service | LLM API returned an error |
| `LLM_RATE_LIMITED` | external-service | LLM API returned a rate limit error |
| `LLM_NETWORK_ERROR` | external-service | Network error during LLM API call |
| `LLM_NO_CONTENT` | external-service | LLM returned an empty response |
| `JMESPATH_EVALUATION_ERROR` | expression | JMESPath expression failed to evaluate at runtime |
| `TEMPLATE_INTERPOLATION_ERROR` | expression | Template string interpolation failed |
| `LLM_OUTPUT_PARSE_ERROR` | output-quality | LLM output couldn't be parsed as valid JSON |
| `EXTRACTION_GAVE_UP` | output-quality | LLM determined data cannot be extracted from source |
| `SLEEP_INVALID_DURATION` | external-service | Sleep duration resolved to an invalid value |
| `WAIT_CONDITION_TIMEOUT` | external-service | `wait-for-condition` exceeded its `timeoutMs` |
| `WAIT_CONDITION_MAX_ATTEMPTS` | external-service | `wait-for-condition` exceeded its `maxAttempts` |
| `EXECUTION_TOTAL_TIMEOUT` | external-service | Total wall-clock time exceeded `limits.maxTotalMs` |
| `EXECUTION_ACTIVE_TIMEOUT` | external-service | Active execution time exceeded `limits.maxActiveMs` |

### Automatic Retry

The executor automatically retries steps that fail with recoverable errors using exponential backoff. The following error codes trigger retry:

- `LLM_RATE_LIMITED`
- `LLM_NETWORK_ERROR`
- `LLM_NO_CONTENT`
- `LLM_OUTPUT_PARSE_ERROR`
- `LLM_API_ERROR` (only if `isRetryable` is `true`)

All other errors fail immediately. Configure retry behavior with `maxRetries` and `retryDelayMs`:

```ts
const result = await executeWorkflow(workflow, {
  tools,
  model: myModel,
  maxRetries: 5,        // Up to 5 retry attempts
  retryDelayMs: 2000,   // Start with 2-second delay, doubling each time
});
```

Each retry attempt is recorded in the [execution state](/guide/execution-state#retry-records) and emitted via the `onStateChange` callback as a `step-retry` delta.

## Durable Execution

The executor supports pluggable durable execution contexts for environments where workflows must survive process restarts, be replayed, or integrate with orchestration frameworks like [Temporal](https://temporal.io/), [Inngest](https://www.inngest.com/), or [AWS Step Functions](https://aws.amazon.com/step-functions/).

### How It Works

The executor splits its work into two categories:

- **Code outside `step()`** — re-executes on every resume. This includes scope construction, step lookups, and `nextStepId` traversal. This code must be idempotent.
- **Code inside `step()`** — executes exactly once. The durable context records the result and replays the cached value on subsequent resumes.

### The `DurableContext` Interface

```ts
interface DurableContext {
  step(name: string, fn: () => Promise<unknown>): Promise<unknown>;
  sleep(name: string, durationMs: number): Promise<void>;
  waitForCondition(
    name: string,
    checkFn: () => Promise<unknown>,
    options: WaitForConditionOptions,
  ): Promise<unknown>;
}
```

| Method | Description |
|---|---|
| `step(name, fn)` | Wrap work that should execute exactly once. In durable environments, `fn` runs on the first invocation and its result is persisted; on subsequent resumes the cached result is returned. |
| `sleep(name, durationMs)` | Sleep for a duration. In durable environments, uses a durable timer that survives process restarts. |
| `waitForCondition(name, checkFn, options)` | Poll a condition function with backoff. In durable environments, may use `waitForCallback` or durable polling. |

### Default Context

By default, the executor uses a simple in-process implementation where `step()` is a passthrough, `sleep()` uses `setTimeout`, and `waitForCondition()` loops with `setTimeout` and backoff. This is suitable for development and short-lived workflows.

```ts
import { createDefaultDurableContext } from "@isaacwasserman/remora";

// The default — you don't need to pass this explicitly
const context = createDefaultDurableContext();
```

### Custom Context

To integrate with a durable execution framework, implement the `DurableContext` interface and pass it via the `context` option:

```ts
const result = await executeWorkflow(workflow, {
  tools,
  context: {
    step: async (name, fn) => {
      // Use your framework's step/activity API
      return await temporal.executeActivity(name, fn);
    },
    sleep: async (name, durationMs) => {
      // Use your framework's durable timer
      await temporal.sleep(durationMs);
    },
    waitForCondition: async (name, checkFn, options) => {
      // Use your framework's polling or signal mechanism
      return await temporal.waitForCondition(checkFn, options);
    },
  },
});
```

## Pre-flight Validation

Before executing any steps, the executor performs pre-flight validation:

1. **Model check** — if the workflow contains `llm-prompt`, `extract-data`, or `agent-loop` steps, verifies a `model` was provided
2. **Tool check** — verifies every `tool-call` step's `toolName` exists in the `ToolSet` and has an `execute` function
3. **Agent-loop tool check** — if no `agent` is provided, verifies every tool referenced in `agent-loop` steps exists in the `ToolSet` and has an `execute` function. (When an `agent` is provided, tools come from the Agent itself)
4. **Input validation** — if the workflow has an `inputSchema`, validates provided `inputs` against it

These checks throw immediately with a `ConfigurationError` or `ValidationError`, before the run starts. This prevents partial execution of misconfigured workflows.

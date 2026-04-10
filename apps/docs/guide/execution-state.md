# Execution State

The executor maintains a structured execution state that tracks every step's status, timing, output, errors, and retry attempts. The state is updated immutably through deltas and can be observed in real time via the [`onStateChange`](/guide/execution#onstatechange) callback.

## The State Model

```ts
interface ExecutionState {
  runId: string;                       // Unique ID for this execution
  status: "pending" | "running" | "completed" | "failed";
  startedAt: string;                   // ISO 8601 timestamp
  completedAt?: string;                // Set when the run finishes
  durationMs?: number;                 // Total wall-clock duration
  stepRecords: StepExecutionRecord[];  // One record per step execution
  output?: unknown;                    // Final workflow output
  error?: ErrorSnapshot;               // Error that caused failure
}
```

The `executionState` field on [`ExecutionResult`](/guide/execution#execution-result) gives you the final snapshot after a run completes:

```ts
const result = await executeWorkflow(workflow, { tools });

const { executionState } = result;
console.log(`Run ${executionState.runId}: ${executionState.status}`);
console.log(`Duration: ${executionState.durationMs}ms`);
console.log(`Steps executed: ${executionState.stepRecords.length}`);
```

## Step Execution Records

Each step execution produces a `StepExecutionRecord`:

```ts
interface StepExecutionRecord {
  stepId: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped" | "awaiting-approval";
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  output?: unknown;                    // The step's output value
  error?: ErrorSnapshot;               // Error if the step failed
  resolvedInputs?: unknown;            // Resolved input expressions
  retries: RetryRecord[];              // All retry attempts
  path: ExecutionPathSegment[];        // Structural context (loop iteration, branch, etc.)
}
```

A single step ID can appear in multiple records — for example, a step inside a `for-each` loop produces one record per iteration, each with a different `path`.

### Querying Step Records

```ts
const { executionState } = result;

// Find all records for a specific step
const classifyRecords = executionState.stepRecords.filter(
  (r) => r.stepId === "classify_ticket"
);

// Find failed steps
const failures = executionState.stepRecords.filter(
  (r) => r.status === "failed"
);

// Find steps with retries
const retriedSteps = executionState.stepRecords.filter(
  (r) => r.retries.length > 0
);

// Total execution time across all steps
const totalStepTime = executionState.stepRecords.reduce(
  (sum, r) => sum + (r.durationMs ?? 0),
  0
);
```

### Resolved Inputs

The `resolvedInputs` field captures the input values after JMESPath expression evaluation — showing what values the step actually received at runtime. This is useful for debugging and for the [workflow viewer](/guide/getting-started#visualize-a-workflow) to display resolved values:

```ts
for (const record of executionState.stepRecords) {
  if (record.resolvedInputs) {
    console.log(`Step "${record.stepId}" received:`, record.resolvedInputs);
  }
}
```

## Execution Path

The `path` field on each step record tracks structural context — which loop iteration, switch branch, or polling attempt the step is executing within. This enables correct attribution when the same step executes multiple times in different contexts.

```ts
type ExecutionPathSegment =
  | {
      type: "for-each";
      stepId: string;          // The for-each step's ID
      iterationIndex: number;  // 0-based iteration index
      itemValue: unknown;      // The current item value
    }
  | {
      type: "switch-case";
      stepId: string;            // The switch-case step's ID
      matchedCaseIndex: number;  // Index of the matched case
      matchedValue: unknown;     // The value that was matched
    }
  | {
      type: "wait-for-condition";
      stepId: string;        // The wait-for-condition step's ID
      pollAttempt: number;   // Current polling attempt number
    };
```

Path segments nest. A step inside a for-each loop that's inside a switch-case branch has a path with two segments:

```ts
// A step executing in the 3rd iteration of a loop, inside a switch branch
const record = executionState.stepRecords.find(
  (r) =>
    r.stepId === "process_item" &&
    r.path.length === 2 &&
    r.path[0].type === "switch-case" &&
    r.path[1].type === "for-each" &&
    r.path[1].iterationIndex === 2
);
```

### Filtering by Path

To find the latest execution of a step across all loop iterations:

```ts
const latestClassify = executionState.stepRecords
  .filter((r) => r.stepId === "classify_ticket")
  .sort((a, b) => {
    const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0;
    const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0;
    return bTime - aTime;
  })[0];
```

To find all executions of a step within a specific loop iteration:

```ts
const iteration2Records = executionState.stepRecords.filter(
  (r) =>
    r.path.some(
      (seg) =>
        seg.type === "for-each" &&
        seg.stepId === "process_each" &&
        seg.iterationIndex === 2
    )
);
```

## Retry Records

When a step is retried due to a [recoverable error](/guide/execution#automatic-retry), each attempt is captured in the step record's `retries` array:

```ts
interface RetryRecord {
  attempt: number;       // 1-based attempt number
  startedAt: string;     // ISO 8601 timestamp
  failedAt: string;      // ISO 8601 timestamp
  errorCode: string;     // The error code that triggered the retry
  errorMessage: string;  // Human-readable error message
}
```

```ts
for (const record of executionState.stepRecords) {
  if (record.retries.length > 0) {
    console.log(`Step "${record.stepId}" was retried ${record.retries.length} time(s):`);
    for (const retry of record.retries) {
      console.log(`  Attempt ${retry.attempt}: ${retry.errorCode} — ${retry.errorMessage}`);
    }
  }
}
```

## Error Snapshots

Errors in the execution state are stored as serializable `ErrorSnapshot` objects rather than class instances:

```ts
interface ErrorSnapshot {
  code: string;
  category: string;
  message: string;
  stepId?: string;
  statusCode?: number;      // For HTTP errors
  isRetryable?: boolean;    // Whether the error was retryable
}
```

You can convert a `StepExecutionError` class instance to a snapshot using `snapshotError`:

```ts
import { snapshotError } from "@remoraflow/core";

try {
  // ...
} catch (e) {
  if (e instanceof StepExecutionError) {
    const snapshot = snapshotError(e);
    // snapshot is JSON-serializable
    await saveToDatabase(snapshot);
  }
}
```

## Execution Deltas

State transitions are represented as immutable deltas. Each delta describes a single atomic change to the execution state:

```ts
type ExecutionDelta =
  | { type: "run-started"; runId: string; startedAt: string }
  | { type: "step-started"; stepId: string; path: ExecutionPathSegment[]; startedAt: string }
  | { type: "step-completed"; stepId: string; path: ExecutionPathSegment[];
      completedAt: string; durationMs: number; output: unknown; resolvedInputs?: unknown }
  | { type: "step-failed"; stepId: string; path: ExecutionPathSegment[];
      failedAt: string; durationMs: number; error: ErrorSnapshot; resolvedInputs?: unknown }
  | { type: "step-retry"; stepId: string; path: ExecutionPathSegment[]; retry: RetryRecord }
  | { type: "run-completed"; runId: string; completedAt: string;
      durationMs: number; output?: unknown }
  | { type: "run-failed"; runId: string; failedAt: string;
      durationMs: number; error: ErrorSnapshot }
  | { type: "step-awaiting-approval"; stepId: string; path: ExecutionPathSegment[];
      sourcePolicyId: string; requestedAt: string }
  | { type: "step-approved"; stepId: string; path: ExecutionPathSegment[];
      sourcePolicyId: string; approvedAt: string }
  | { type: "step-denied"; stepId: string; path: ExecutionPathSegment[];
      sourcePolicyId: string; deniedAt: string; reason?: string }
```

### Delta Lifecycle

A typical successful execution produces deltas in this order:

1. `run-started` — execution begins
2. `step-started` → `step-completed` — for each step (possibly with `step-retry` in between)
3. `run-completed` — execution finishes

A failed execution ends with `run-failed` instead of `run-completed`.

When a step is gated by a [policy](/guide/policies), the sequence includes [approval deltas](/guide/policies#observing-approval-state):

1. `step-started` — step begins
2. `step-awaiting-approval` — policy requested external approval; step status becomes `awaiting-approval`
3. `step-approved` or `step-denied` — the decision arrives
4. If approved: step executes and emits `step-completed` as normal
5. If denied: `step-failed` with error code `POLICY_DENIED`, followed by `run-failed`

### Collecting State History

To build a complete history of all state transitions, collect deltas from `onStateChange`:

```ts
const deltas: ExecutionDelta[] = [];

const result = await executeWorkflow(workflow, {
  tools,
  onStateChange: (_state, delta) => {
    deltas.push(delta);
  },
});

// deltas now contains every state transition in order
console.log(`Total transitions: ${deltas.length}`);
console.log("Timeline:");
for (const delta of deltas) {
  switch (delta.type) {
    case "run-started":
      console.log(`  [${delta.startedAt}] Run started`);
      break;
    case "step-started":
      console.log(`  [${delta.startedAt}] Step "${delta.stepId}" started`);
      break;
    case "step-completed":
      console.log(`  [${delta.completedAt}] Step "${delta.stepId}" completed (${delta.durationMs}ms)`);
      break;
    case "step-failed":
      console.log(`  [${delta.failedAt}] Step "${delta.stepId}" failed: ${delta.error.message}`);
      break;
    case "step-retry":
      console.log(`  Step "${delta.stepId}" retry #${delta.retry.attempt}: ${delta.retry.errorCode}`);
      break;
    case "run-completed":
      console.log(`  [${delta.completedAt}] Run completed (${delta.durationMs}ms)`);
      break;
    case "run-failed":
      console.log(`  [${delta.failedAt}] Run failed: ${delta.error.message}`);
      break;
    case "step-awaiting-approval":
      console.log(`  [${delta.requestedAt}] Step "${delta.stepId}" awaiting approval (policy: ${delta.sourcePolicyId})`);
      break;
    case "step-approved":
      console.log(`  [${delta.approvedAt}] Step "${delta.stepId}" approved`);
      break;
    case "step-denied":
      console.log(`  [${delta.deniedAt}] Step "${delta.stepId}" denied: ${delta.reason}`);
      break;
  }
}
```

## Replaying State

The `applyDelta` function is a pure reducer that applies a delta to an execution state, returning a new state without mutation:

```ts
import { applyDelta } from "@remoraflow/core";

// Replay a sequence of deltas to reconstruct state at any point
let state: ExecutionState = {
  runId: "initial",
  status: "pending",
  startedAt: new Date().toISOString(),
  stepRecords: [],
};

for (const delta of savedDeltas) {
  state = applyDelta(state, delta);

  // Inspect state at each point in time
  console.log(`After ${delta.type}: ${state.status}, ${state.stepRecords.length} records`);
}
```

This is useful for:

- **Debugging** — reconstruct the execution state at any point by replaying deltas up to that point
- **Persistence** — store deltas as an append-only log and reconstruct state on demand
- **Testing** — verify state transitions by applying deltas and asserting on the result

## Streaming State to a UI

The `onStateChange` callback integrates naturally with React or other UI frameworks for live execution visualization:

```ts
// React example: stream execution state to a component
const [executionState, setExecutionState] = useState<ExecutionState | null>(null);

async function runWorkflow() {
  const result = await executeWorkflow(workflow, {
    tools,
    onStateChange: (state) => {
      setExecutionState(state); // Triggers re-render on every state change
    },
  });
}
```

For use cases that need to stream across process or network boundaries — for example, an HTTP handler that streams state snapshots to a browser, or a worker that publishes to Redis pub/sub — use a [channel](/guide/streaming) instead. Channels support multiple concurrent subscribers, replay, debouncing, and custom transports. The `executeWorkflowStream` helper returns an `AsyncIterable<ExecutionState>` you can yield directly from a streaming handler:

```ts
import { executeWorkflowStream } from "@remoraflow/core";

async function* handler(req) {
  yield* executeWorkflowStream(workflow, { tools, model, inputs: req.inputs });
}
```

The [`WorkflowViewer`](/guide/getting-started#visualize-a-workflow) component accepts `executionState` as a prop, automatically highlighting running, completed, and failed steps:

```tsx
import { WorkflowViewer } from "@remoraflow/ui";

<WorkflowViewer
  workflow={workflow}
  executionState={executionState}  // Live updates during execution
/>
```

## Deriving Step Summaries

The viewer exports a `deriveStepSummaries` helper that aggregates step execution records into per-step summaries. This is useful when a step executes multiple times (inside loops) and you want a single summary:

```ts
import { deriveStepSummaries } from "@remoraflow/ui";

const summaries = deriveStepSummaries(result.executionState);

for (const [stepId, summary] of Object.entries(summaries)) {
  console.log(`${stepId}:`);
  console.log(`  Status: ${summary.status}`);
  console.log(`  Executions: ${summary.executionCount}`);
  console.log(`  Completed: ${summary.completedCount}`);
  console.log(`  Failed: ${summary.failedCount}`);
  console.log(`  Total retries: ${summary.totalRetries}`);
  if (summary.latestOutput) {
    console.log(`  Latest output:`, summary.latestOutput);
  }
  if (summary.latestError) {
    console.log(`  Latest error: [${summary.latestError.code}] ${summary.latestError.message}`);
  }
}
```

# Streaming & Channels

RemoraFlow's executor emits a full [`ExecutionState`](/guide/execution-state) snapshot on every state transition. These snapshots can be streamed to UIs, logged to observability pipelines, forwarded across process or network boundaries, and replayed later.

There are three ways to observe execution in real time:

| API | Shape | Best for |
|---|---|---|
| [`onStateChange`](/guide/execution#onstatechange) callback | `(state, delta) => void` | Simple in-process callbacks, inspection, logging |
| [`executeWorkflowStream`](#executeworkflowstream) | `AsyncIterable<ExecutionState>` | Streaming over HTTP, server handlers, async iteration |
| [`channel` option](#the-channel-option) | Pluggable pub/sub | Multiple subscribers, debouncing, persistent/networked transports |

All three integrate with the same underlying state model, so you can mix and match — for example, you can pass a channel **and** an `onStateChange` callback to the same `executeWorkflow` call. The channel and callback both fire on every state transition.

## `executeWorkflowStream`

`executeWorkflowStream` is the quickest way to stream. It runs the workflow in the background and returns an `AsyncIterable<ExecutionState>` that yields every state snapshot — starting with a full replay of any states captured before the first `await` — and terminates when the run completes or fails.

```ts
import { executeWorkflowStream } from "@remoraflow/core";

for await (const state of executeWorkflowStream(workflow, {
  tools,
  model,
  inputs: { userId: "u_123" },
})) {
  console.log(`[${state.status}] ${state.stepRecords.length} step records`);
}
```

The signature is identical to [`executeWorkflow`](/guide/execution) — it accepts the same [`ExecuteWorkflowOptions`](/guide/execution#execution-options). The only difference is the return type: instead of a `Promise<ExecutionResult>`, you get an `AsyncIterable<ExecutionState>`.

::: tip
Because the iterable replays from the beginning, you're guaranteed to see every state even if you start iterating after the run has already started producing events. The last state emitted is always the terminal state (`completed` or `failed`).
:::

### Streaming over HTTP

`executeWorkflowStream` composes naturally with any framework that supports async iterables — [oRPC](https://orpc.unnoq.com/), [tRPC](https://trpc.io/) subscriptions, Hono streams, raw server-sent events, etc. Here's an oRPC handler that yields state snapshots straight to the client:

```ts
import { executeWorkflowStream } from "@remoraflow/core";
import { os } from "@orpc/server";

const executeProc = os
  .input(/* ... */)
  .handler(async function* ({ input }) {
    yield* executeWorkflowStream(input.workflow, {
      tools,
      model,
      inputs: input.inputs,
    });
  });
```

Each yielded `ExecutionState` is a serializable snapshot, so it can be transported as JSON without any additional marshalling.

## The `channel` Option

For more flexibility — multiple subscribers, debouncing, or publishing to a custom transport — `executeWorkflow` accepts a `channel` option. The channel receives every state snapshot via `publish()` and is closed automatically when the run finishes (via `executeWorkflow`'s `finally` block).

```ts
import {
  executeWorkflow,
  MemoryExecutionStateChannel,
} from "@remoraflow/core";

const channel = new MemoryExecutionStateChannel();

// Start the workflow — the channel publishes on every state transition.
const resultPromise = executeWorkflow(workflow, {
  tools,
  model,
  channel,
});

// Subscribe to the channel from elsewhere — possibly many consumers.
for await (const state of channel.subscribe({ replay: true })) {
  console.log(state.status);
}

const result = await resultPromise;
```

The `channel` option works alongside `onStateChange` — both fire on every state transition. Under the hood, `executeWorkflowStream` is just a thin wrapper that creates a `MemoryExecutionStateChannel`, passes it as `channel`, and returns `channel.subscribe({ replay: true })`.

## The `WorkflowExecutionStateChannel` Interface

A channel is a pub/sub abstraction for streaming state snapshots from an executor to one or more consumers:

```ts
interface WorkflowExecutionStateChannel {
  /** Push a new state snapshot into the channel. */
  publish(state: ExecutionState): void | Promise<void>;

  /** Signal that no more states will be published. Subscribers drain and terminate. */
  close(): void | Promise<void>;

  /**
   * Subscribe to state updates.
   * - Default (`replay: false`): yields the latest state immediately, then follows live.
   * - `replay: true`: yields the full history from the beginning, then follows live.
   */
  subscribe(opts?: { replay?: boolean }): AsyncIterable<ExecutionState>;

  /** Returns the most recent state, or `null` if none has been published. */
  latest?(): Promise<ExecutionState | null>;
}
```

### Subscription Modes

| Mode | Behavior |
|---|---|
| `subscribe()` (default) | Yields only the latest state (if any), then follows live updates. Best for UIs that only care about the current state. |
| `subscribe({ replay: true })` | Yields every state from the beginning, then follows live updates. Best for building a complete history or driving a replay slider. |

Both modes terminate when the channel is closed and the buffer is drained.

### Multiple Subscribers

A single channel can serve many concurrent subscribers. Each receives its own copy of the stream:

```ts
const channel = new MemoryExecutionStateChannel();

// Consumer 1: full replay for persistence
const persistPromise = (async () => {
  const all: ExecutionState[] = [];
  for await (const state of channel.subscribe({ replay: true })) {
    all.push(state);
  }
  return all;
})();

// Consumer 2: live-only for a UI indicator
const livePromise = (async () => {
  for await (const state of channel.subscribe()) {
    updateStatusBadge(state.status);
  }
})();

await executeWorkflow(workflow, { tools, model, channel });
await Promise.all([persistPromise, livePromise]);
```

## `MemoryExecutionStateChannel`

The built-in `MemoryExecutionStateChannel` is a simple in-memory implementation that buffers every published state in an array. It's what `executeWorkflowStream` uses internally and is suitable for single-process use:

```ts
import { MemoryExecutionStateChannel } from "@remoraflow/core";

const channel = new MemoryExecutionStateChannel();
// or with debounce:
const debounced = new MemoryExecutionStateChannel({
  debounce: { ms: 100 },
});
```

| Feature | Notes |
|---|---|
| Subscriber fan-out | Unlimited concurrent subscribers |
| Replay | Full history buffered in memory for the channel's lifetime |
| Persistence | None — intended for single-process use |
| `latest()` | Returns the most recently published state, or `null` |

Because the channel buffers every state in memory, avoid reusing a single long-lived channel across many runs — create one per execution and let it be garbage-collected when the run completes.

## Debouncing

High-frequency state transitions — a tight `for-each` loop, a retry storm, a rapid sequence of LLM tokens — can produce more events than a UI can usefully render. The debounce option coalesces rapid publishes into a single emission per interval:

```ts
const channel = new MemoryExecutionStateChannel({
  debounce: {
    /** Minimum interval in milliseconds between emitted states. */
    ms: 100,
    /**
     * Always flush terminal states (`completed` / `failed`) immediately,
     * bypassing the debounce window. Defaults to `true`.
     */
    flushOnComplete: true,
  },
});
```

With debounce enabled:

- Intermediate states published within the debounce window are coalesced — only the **most recent** state is emitted at the end of the window.
- Terminal states (`completed`, `failed`) bypass the window and flush immediately, unless `flushOnComplete: false`.
- On `close()`, any buffered state is flushed before the channel terminates.

::: warning
Debouncing is lossy by design: intermediate states that land inside the debounce window are dropped in favor of the latest one. Subscribers in `replay: true` mode will see the coalesced history — not every individual snapshot. If you need lossless history (e.g., for audit logs), don't enable debounce.
:::

## Custom Channels

To stream execution state across process boundaries — for example, to a Redis pub/sub topic, a WebSocket server, a Kafka partition, or a database — implement your own channel. The easiest path is to extend `BaseExecutionStateChannel`, which handles the debounce bookkeeping for you:

```ts
import {
  BaseExecutionStateChannel,
  type ExecutionState,
} from "@remoraflow/core";

class RedisExecutionStateChannel extends BaseExecutionStateChannel {
  constructor(
    private readonly redis: Redis,
    private readonly topic: string,
    options?: ConstructorParameters<typeof BaseExecutionStateChannel>[0],
  ) {
    super(options);
  }

  protected async emit(state: ExecutionState): Promise<void> {
    await this.redis.publish(this.topic, JSON.stringify(state));
  }

  protected async doClose(): Promise<void> {
    await this.redis.publish(this.topic, JSON.stringify({ __closed: true }));
  }

  subscribe(): AsyncIterable<ExecutionState> {
    // Return an async iterable that consumes from redis.subscribe(this.topic).
    // Translate the sentinel `{ __closed: true }` message into stream termination.
    throw new Error("not implemented");
  }
}
```

`BaseExecutionStateChannel` requires three abstract methods:

| Method | Purpose |
|---|---|
| `emit(state)` | Deliver a state snapshot to subscribers. Called after debounce logic has decided that a state should be released. |
| `doClose()` | Subclass-specific cleanup (e.g., resolve pending waiters, notify remote subscribers). Called by `close()` after any buffered state is flushed. |
| `subscribe(opts?)` | Return an async iterable over state snapshots. Must honor `opts.replay` if your transport supports history. |

You can also implement `WorkflowExecutionStateChannel` directly if you don't want the debounce machinery, but extending `BaseExecutionStateChannel` is recommended so that callers can opt into debouncing via the standard options interface.

::: tip
Make sure your `publish()` and `close()` implementations are async-safe — the executor awaits both. Dropping awaits can cause states to arrive out of order, or cause the run to finish before the final state reaches your subscribers.
:::

## Persistence & Resume

Channels pair naturally with the `initialState` option on `executeWorkflow` for resumable execution. Persist states as they stream, then feed the last snapshot back into `executeWorkflow` to pick up where the run left off:

```ts
const channel = new MemoryExecutionStateChannel();

// Persist every state to disk (or a database).
(async () => {
  for await (const state of channel.subscribe({ replay: true })) {
    await savePartialState(workflow.id, state);
  }
})();

try {
  await executeWorkflow(workflow, { tools, model, channel });
} catch (err) {
  // Later, resume from the last saved state:
  const lastState = await loadPartialState(workflow.id);
  await executeWorkflow(workflow, {
    tools,
    model,
    initialState: lastState,
  });
}
```

For production-grade durability, pair a persistent channel with a [`DurableContext`](/guide/execution#durable-execution) from your orchestration framework.

## See Also

- [Execution](/guide/execution) — the full `executeWorkflow` API, including the `channel` option
- [Execution State](/guide/execution-state) — the state model, deltas, and `applyDelta` reducer
- [Policies & Approvals](/guide/policies) — how approval deltas flow through the state stream

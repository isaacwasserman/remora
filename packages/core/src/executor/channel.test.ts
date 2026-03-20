import { describe, expect, test } from "bun:test";
import { tool } from "ai";
import { type } from "arktype";
import type { WorkflowDefinition } from "../types";
import { executeWorkflow, executeWorkflowStream } from ".";
import { MemoryExecutionStateChannel } from "./channel";
import type { ExecutionState, RunStatus } from "./state";

// ─── Helpers ─────────────────────────────────────────────────────

function makeState(status: RunStatus, index: number): ExecutionState {
  return {
    runId: "test-run",
    status,
    startedAt: new Date().toISOString(),
    stepRecords: [],
    workflowHash: `hash-${index}`,
  };
}

async function collect(
  iter: AsyncIterable<ExecutionState>,
): Promise<ExecutionState[]> {
  const results: ExecutionState[] = [];
  for await (const state of iter) {
    results.push(state);
  }
  return results;
}

const echoTools = {
  echo: tool({
    inputSchema: type({}),
    execute: async () => ({ echoed: true }),
  }),
};

function echoWorkflow(): WorkflowDefinition {
  return {
    name: "echo-test",
    initialStepId: "start",
    steps: [
      { id: "start", type: "start", nextStepId: "call-echo" },
      {
        id: "call-echo",
        type: "tool-call",
        params: { toolName: "echo", toolInput: {} },
        nextStepId: "end",
      },
      { id: "end", type: "end", params: {} },
    ],
  };
}

// ─── MemoryExecutionStateChannel ─────────────────────────────────

describe("MemoryExecutionStateChannel", () => {
  test("subscribe with replay yields all published states", async () => {
    const channel = new MemoryExecutionStateChannel();
    channel.publish(makeState("pending", 0));
    channel.publish(makeState("running", 1));
    channel.publish(makeState("completed", 2));
    channel.close();

    const states = await collect(channel.subscribe({ replay: true }));
    expect(states).toHaveLength(3);
    expect(states[0]?.status).toBe("pending");
    expect(states[1]?.status).toBe("running");
    expect(states[2]?.status).toBe("completed");
  });

  test("subscribe without replay yields only latest then live", async () => {
    const channel = new MemoryExecutionStateChannel();
    channel.publish(makeState("pending", 0));
    channel.publish(makeState("running", 1));

    // Subscribe without replay — should get only the latest (running).
    const iter = channel.subscribe()[Symbol.asyncIterator]();
    const first = await iter.next();
    expect(first.done).toBe(false);
    expect(first.value.status).toBe("running");

    // Publish another, then close.
    channel.publish(makeState("completed", 2));
    channel.close();

    const second = await iter.next();
    expect(second.done).toBe(false);
    expect(second.value.status).toBe("completed");

    const done = await iter.next();
    expect(done.done).toBe(true);
  });

  test("subscribe with no prior states waits for first publish", async () => {
    const channel = new MemoryExecutionStateChannel();

    const iter = channel.subscribe()[Symbol.asyncIterator]();

    // Publish after a microtask delay.
    queueMicrotask(() => {
      channel.publish(makeState("running", 0));
      channel.close();
    });

    const first = await iter.next();
    expect(first.value.status).toBe("running");

    const done = await iter.next();
    expect(done.done).toBe(true);
  });

  test("close terminates subscriber iteration", async () => {
    const channel = new MemoryExecutionStateChannel();
    channel.publish(makeState("running", 0));

    const iter = channel.subscribe({ replay: true })[Symbol.asyncIterator]();
    await iter.next(); // consume the running state

    // Close should terminate.
    channel.close();
    const result = await iter.next();
    expect(result.done).toBe(true);
  });

  test("latest returns most recent state", async () => {
    const channel = new MemoryExecutionStateChannel();
    expect(await channel.latest()).toBeNull();

    channel.publish(makeState("pending", 0));
    channel.publish(makeState("running", 1));
    const latest = await channel.latest();
    expect(latest?.status).toBe("running");
  });

  test("multiple concurrent subscribers each get all states", async () => {
    const channel = new MemoryExecutionStateChannel();

    const p1 = collect(channel.subscribe({ replay: true }));
    const p2 = collect(channel.subscribe({ replay: true }));

    channel.publish(makeState("pending", 0));
    channel.publish(makeState("running", 1));
    channel.publish(makeState("completed", 2));
    channel.close();

    const [s1, s2] = await Promise.all([p1, p2]);
    expect(s1).toHaveLength(3);
    expect(s2).toHaveLength(3);
  });
});

// ─── Debounce ────────────────────────────────────────────────────

describe("debounce", () => {
  test("rapid publishes are debounced", async () => {
    const channel = new MemoryExecutionStateChannel({
      debounce: { ms: 50 },
    });

    const collected = collect(channel.subscribe({ replay: true }));

    // Publish rapidly — only the last should arrive after debounce.
    channel.publish(makeState("pending", 0));
    channel.publish(makeState("running", 1));
    channel.publish(makeState("running", 2));

    // Wait for the debounce to flush.
    await new Promise((r) => setTimeout(r, 80));
    channel.close();

    const states = await collected;
    // Should have 1 debounced state (the last running).
    expect(states).toHaveLength(1);
    expect(states[0]?.workflowHash).toBe("hash-2");
  });

  test("terminal states flush immediately", async () => {
    const channel = new MemoryExecutionStateChannel({
      debounce: { ms: 200 },
    });

    const collected = collect(channel.subscribe({ replay: true }));

    channel.publish(makeState("pending", 0));
    channel.publish(makeState("completed", 1));
    channel.close();

    const states = await collected;
    // The completed state bypasses debounce and flushes immediately.
    // The pending state is still buffered when completed flushes, so it's lost.
    expect(states.some((s) => s.status === "completed")).toBe(true);
  });

  test("flushOnComplete: false does not bypass debounce for terminal states", async () => {
    const channel = new MemoryExecutionStateChannel({
      debounce: { ms: 200, flushOnComplete: false },
    });

    channel.publish(makeState("pending", 0));
    channel.publish(makeState("completed", 1));

    // Neither should have flushed yet (within debounce window).
    expect(await channel.latest()).toBeNull();

    channel.close(); // close flushes buffered state
    const latest = await channel.latest();
    expect(latest?.status).toBe("completed");
  });
});

// ─── executeWorkflowStream ───────────────────────────────────────

describe("executeWorkflowStream", () => {
  test("yields states and terminates for a simple workflow", async () => {
    const states = await collect(
      executeWorkflowStream(echoWorkflow(), { tools: echoTools }),
    );

    expect(states.length).toBeGreaterThanOrEqual(2);

    const last = states.at(-1);
    expect(last?.status).toBe("completed");
  });
});

// ─── Channel option on executeWorkflow ───────────────────────────

describe("executeWorkflow channel option", () => {
  test("publishes states to the provided channel", async () => {
    const channel = new MemoryExecutionStateChannel();
    const collected = collect(channel.subscribe({ replay: true }));

    await executeWorkflow(echoWorkflow(), {
      tools: echoTools,
      channel,
    });

    const states = await collected;
    expect(states.length).toBeGreaterThanOrEqual(2);

    const last = states.at(-1);
    expect(last?.status).toBe("completed");
  });

  test("channel works alongside onStateChange", async () => {
    const channel = new MemoryExecutionStateChannel();
    const onChangeStates: ExecutionState[] = [];

    const collected = collect(channel.subscribe({ replay: true }));

    await executeWorkflow(echoWorkflow(), {
      tools: echoTools,
      channel,
      onStateChange: (state) => {
        onChangeStates.push(state);
      },
    });

    const channelStates = await collected;

    expect(channelStates.length).toBeGreaterThanOrEqual(2);
    expect(onChangeStates.length).toBe(channelStates.length);
  });
});

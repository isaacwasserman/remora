import { GlobalRegistrator } from "@happy-dom/global-registrator";

if (!globalThis.document) {
  GlobalRegistrator.register();
}

import { describe, expect, test } from "bun:test";
import type { ExecutionState, WorkflowDefinition } from "@remoraflow/core";
import { hashWorkflow } from "@remoraflow/core";
import { act, renderHook } from "@testing-library/react";
import {
  type UseWorkflowExecutionOptions,
  useWorkflowExecution,
} from "./use-workflow-execution";

// ─── Helpers ─────────────────────────────────────────────────────

const WORKFLOW: WorkflowDefinition = {
  name: "test",
  initialStepId: "start",
  steps: [
    { id: "start", type: "start", nextStepId: "end" },
    { id: "end", type: "end", params: {} },
  ],
};

const WORKFLOW_HASH = hashWorkflow(WORKFLOW);

function makeState(
  status: "pending" | "running" | "completed" | "failed",
  extra?: Partial<ExecutionState>,
): ExecutionState {
  return {
    runId: "run-1",
    status,
    startedAt: new Date().toISOString(),
    stepRecords: [],
    workflowHash: WORKFLOW_HASH,
    ...extra,
  };
}

/**
 * Creates a controllable async iterable for testing.
 * Call `push(state)` to emit a state, and `done()` to close the stream.
 */
function createControllableStream() {
  const states: ExecutionState[] = [];
  let resolve: (() => void) | null = null;
  let closed = false;

  const iterable: AsyncIterable<ExecutionState> = {
    [Symbol.asyncIterator]() {
      let cursor = 0;
      return {
        async next() {
          while (cursor >= states.length) {
            if (closed) return { done: true as const, value: undefined };
            await new Promise<void>((r) => {
              resolve = r;
            });
          }
          return { done: false as const, value: states[cursor++] };
        },
      };
    },
  };

  return {
    iterable,
    push(state: ExecutionState) {
      states.push(state);
      resolve?.();
      resolve = null;
    },
    done() {
      closed = true;
      resolve?.();
      resolve = null;
    },
  };
}

function createOptions(
  overrides?: Partial<UseWorkflowExecutionOptions>,
): UseWorkflowExecutionOptions {
  return {
    execute: () => createControllableStream().iterable,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────

describe("useWorkflowExecution", () => {
  test("initial state is idle", () => {
    const { result } = renderHook(() =>
      useWorkflowExecution(WORKFLOW, createOptions()),
    );

    expect(result.current.executionState).toBeNull();
    expect(result.current.stateHistory).toEqual([]);
    expect(result.current.isRunning).toBe(false);
    expect(result.current.isPaused).toBe(false);
    expect(result.current.replayIndex).toBeNull();
  });

  test("run starts execution and accumulates state history", async () => {
    const stream = createControllableStream();
    const { result } = renderHook(() =>
      useWorkflowExecution(
        WORKFLOW,
        createOptions({ execute: () => stream.iterable }),
      ),
    );

    await act(async () => {
      result.current.run({});
    });

    expect(result.current.isRunning).toBe(true);

    const runningState = makeState("running");
    await act(async () => {
      stream.push(runningState);
    });

    expect(result.current.stateHistory).toHaveLength(1);
    expect(result.current.executionState?.status).toBe("running");

    const completedState = makeState("completed");
    await act(async () => {
      stream.push(completedState);
      stream.done();
    });

    // Let the async iteration finish.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current.stateHistory).toHaveLength(2);
    expect(result.current.executionState?.status).toBe("completed");
    expect(result.current.isRunning).toBe(false);
  });

  test("pause stops iteration and sets isPaused", async () => {
    const stream = createControllableStream();
    const { result } = renderHook(() =>
      useWorkflowExecution(
        WORKFLOW,
        createOptions({ execute: () => stream.iterable }),
      ),
    );

    await act(async () => {
      result.current.run({});
    });

    await act(async () => {
      stream.push(makeState("running"));
    });

    await act(async () => {
      result.current.pause();
    });

    expect(result.current.isRunning).toBe(false);
    expect(result.current.isPaused).toBe(true);
  });

  test("reset clears all state", async () => {
    const stream = createControllableStream();
    const { result } = renderHook(() =>
      useWorkflowExecution(
        WORKFLOW,
        createOptions({ execute: () => stream.iterable }),
      ),
    );

    await act(async () => {
      result.current.run({});
    });

    await act(async () => {
      stream.push(makeState("running"));
    });

    await act(async () => {
      result.current.reset();
    });

    expect(result.current.executionState).toBeNull();
    expect(result.current.stateHistory).toEqual([]);
    expect(result.current.isRunning).toBe(false);
    expect(result.current.isPaused).toBe(false);
    expect(result.current.replayIndex).toBeNull();
  });

  test("seekTo sets replay index and updates visible state", async () => {
    const stream = createControllableStream();
    const { result } = renderHook(() =>
      useWorkflowExecution(
        WORKFLOW,
        createOptions({ execute: () => stream.iterable }),
      ),
    );

    await act(async () => {
      result.current.run({});
    });

    const state0 = makeState("running", { runId: "s0" });
    const state1 = makeState("running", { runId: "s1" });
    const state2 = makeState("completed", { runId: "s2" });

    await act(async () => {
      stream.push(state0);
      stream.push(state1);
      stream.push(state2);
      stream.done();
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current.stateHistory).toHaveLength(3);

    // Seek to the first state.
    await act(async () => {
      result.current.seekTo(0);
    });

    expect(result.current.replayIndex).toBe(0);
    expect(result.current.executionState?.runId).toBe("s0");
  });

  test("goLive returns to latest state", async () => {
    const stream = createControllableStream();
    const { result } = renderHook(() =>
      useWorkflowExecution(
        WORKFLOW,
        createOptions({ execute: () => stream.iterable }),
      ),
    );

    await act(async () => {
      result.current.run({});
    });

    await act(async () => {
      stream.push(makeState("running", { runId: "s0" }));
      stream.push(makeState("completed", { runId: "s1" }));
      stream.done();
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    // Seek back, then go live.
    await act(async () => {
      result.current.seekTo(0);
    });

    expect(result.current.replayIndex).toBe(0);

    await act(async () => {
      result.current.goLive();
    });

    expect(result.current.replayIndex).toBeNull();
    expect(result.current.executionState?.runId).toBe("s1");
  });

  test("persist.save is called on pause", async () => {
    const stream = createControllableStream();
    const saved: { hash: string; state: ExecutionState }[] = [];

    const { result } = renderHook(() =>
      useWorkflowExecution(
        WORKFLOW,
        createOptions({
          execute: () => stream.iterable,
          persist: {
            save: (hash, state) => saved.push({ hash, state }),
            load: () => null,
            clear: () => {},
          },
        }),
      ),
    );

    await act(async () => {
      result.current.run({});
    });

    const runningState = makeState("running");
    await act(async () => {
      stream.push(runningState);
    });

    await act(async () => {
      result.current.pause();
    });

    expect(saved).toHaveLength(1);
    expect(saved[0]?.hash).toBe(WORKFLOW_HASH);
    expect(saved[0]?.state.status).toBe("running");
  });

  test("persist.load restores paused state on mount", () => {
    const pausedState = makeState("running");

    const { result } = renderHook(() =>
      useWorkflowExecution(
        WORKFLOW,
        createOptions({
          persist: {
            save: () => {},
            load: () => pausedState,
            clear: () => {},
          },
        }),
      ),
    );

    expect(result.current.isPaused).toBe(true);
  });

  test("resume calls execute with initialState", async () => {
    const pausedState = makeState("running");
    const stream = createControllableStream();
    const executeCalls: Array<{ initialState?: ExecutionState }> = [];

    const { result } = renderHook(() =>
      useWorkflowExecution(
        WORKFLOW,
        createOptions({
          execute: (params) => {
            executeCalls.push({ initialState: params.initialState });
            return stream.iterable;
          },
          persist: {
            save: () => {},
            load: () => pausedState,
            clear: () => {},
          },
        }),
      ),
    );

    expect(result.current.isPaused).toBe(true);

    await act(async () => {
      result.current.resume();
    });

    expect(result.current.isRunning).toBe(true);
    expect(result.current.isPaused).toBe(false);
    expect(executeCalls).toHaveLength(1);
    expect(executeCalls[0]?.initialState?.status).toBe("running");

    // Clean up
    stream.done();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
  });

  test("execute returning a Promise<AsyncIterable> works", async () => {
    const stream = createControllableStream();

    const { result } = renderHook(() =>
      useWorkflowExecution(
        WORKFLOW,
        createOptions({
          execute: async () => stream.iterable,
        }),
      ),
    );

    await act(async () => {
      result.current.run({});
    });

    await act(async () => {
      stream.push(makeState("completed"));
      stream.done();
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current.executionState?.status).toBe("completed");
  });
});

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
    initialStepId: "start",
    steps: [
        { id: "start", type: "start", name: "Start", description: "", nextStepId: "end" },
        { id: "end", type: "end", name: "End", description: "" },
    ],
};

const WORKFLOW_HASH = hashWorkflow(WORKFLOW);

function makeState(
    status: ExecutionState["status"],
    extra?: Partial<ExecutionState>,
): ExecutionState {
    return {
        status,
        output: status === "success" ? null : null,
        error: status === "error" ? { code: "UNKNOWN", message: "test error" } : null,
        logs: [],
        scope: {},
        executionPath: [],
        ...extra,
    } as ExecutionState;
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
                        if (closed)
                            return { done: true as const, value: undefined };
                        await new Promise<void>((r) => {
                            resolve = r;
                        });
                    }
                    return { done: false as const, value: states[cursor++]! };
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

        const runningState = makeState("in-progress");
        await act(async () => {
            stream.push(runningState);
        });

        expect(result.current.stateHistory).toHaveLength(1);
        expect(result.current.executionState?.status).toBe("in-progress");

        const completedState = makeState("success");
        await act(async () => {
            stream.push(completedState);
            stream.done();
        });

        // Let the async iteration finish.
        await act(async () => {
            await new Promise((r) => setTimeout(r, 10));
        });

        expect(result.current.stateHistory).toHaveLength(2);
        expect(result.current.executionState?.status).toBe("success");
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
            stream.push(makeState("in-progress"));
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
            stream.push(makeState("in-progress"));
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

        const state0 = makeState("in-progress", { scope: { tag: "s0" } });
        const state1 = makeState("in-progress", { scope: { tag: "s1" } });
        const state2 = makeState("success", { scope: { tag: "s2" } });

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
        expect(result.current.executionState?.scope).toEqual({ tag: "s0" });
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
            stream.push(makeState("in-progress", { scope: { tag: "s0" } }));
            stream.push(makeState("success", { scope: { tag: "s1" } }));
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
        expect(result.current.executionState?.scope).toEqual({ tag: "s1" });
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

        const runningState = makeState("in-progress");
        await act(async () => {
            stream.push(runningState);
        });

        await act(async () => {
            result.current.pause();
        });

        expect(saved).toHaveLength(1);
        expect(saved[0]?.hash).toBe(WORKFLOW_HASH);
        expect(saved[0]?.state.status).toBe("in-progress");
    });

    test("persist.load restores paused state on mount", () => {
        const pausedState = makeState("in-progress");

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
        const pausedState = makeState("in-progress");
        const stream = createControllableStream();
        const executeCalls: Array<{ initialState?: ExecutionState }> = [];

        const { result } = renderHook(() =>
            useWorkflowExecution(
                WORKFLOW,
                createOptions({
                    execute: (params) => {
                        executeCalls.push({
                            initialState: params.initialState,
                        });
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
        expect(executeCalls[0]?.initialState?.status).toBe("in-progress");

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
            stream.push(makeState("success"));
            stream.done();
        });

        await act(async () => {
            await new Promise((r) => setTimeout(r, 10));
        });

        expect(result.current.executionState?.status).toBe("success");
    });
});

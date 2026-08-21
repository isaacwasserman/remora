import type { ExecutionState, WorkflowDefinition } from "@remoraflow/core";
import { useCallback, useEffect, useRef, useState } from "react";

function hashWorkflow(workflow: WorkflowDefinition): string {
    const str = JSON.stringify(workflow);
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
}

// ─── Types ───────────────────────────────────────────────────────

export interface UseWorkflowExecutionOptions {
    /** Function that starts execution and returns an async iterable of state snapshots. */
    execute: (params: {
        workflow: WorkflowDefinition;
        inputs: Record<string, unknown>;
        initialState?: ExecutionState;
    }) =>
        | AsyncIterable<ExecutionState>
        | Promise<AsyncIterable<ExecutionState>>;

    /** Optional persistence layer for pause/resume across page reloads. */
    persist?: {
        save: (hash: string, state: ExecutionState) => void;
        load: (hash: string) => ExecutionState | null;
        clear: (hash: string) => void;
    };
}

export interface WorkflowExecutionControls {
    /** The currently displayed execution state (respects replay position). */
    executionState: ExecutionState | null;
    /** Full history of all received state snapshots. */
    stateHistory: ExecutionState[];
    /** Whether a workflow is currently executing. */
    isRunning: boolean;
    /** Whether execution is paused with a resumable state. */
    isPaused: boolean;

    /** Start a new execution. */
    run: (inputs?: Record<string, unknown>) => void;
    /** Pause the current execution (can be resumed later). */
    pause: () => void;
    /** Resume a paused execution. */
    resume: () => void;
    /** Reset all execution state. */
    reset: () => void;

    /** Current replay slider position, or `null` if viewing live. */
    replayIndex: number | null;
    /** Seek to a specific state in the history. */
    seekTo: (index: number) => void;
    /** Jump to the latest state (exit replay mode). */
    goLive: () => void;
}

// ─── Hook ────────────────────────────────────────────────────────

export function useWorkflowExecution(
    workflow: WorkflowDefinition | null,
    options: UseWorkflowExecutionOptions,
): WorkflowExecutionControls {
    const [executionState, setExecutionState] = useState<ExecutionState | null>(
        null,
    );
    const [stateHistory, setStateHistory] = useState<ExecutionState[]>([]);
    const [isRunning, setIsRunning] = useState(false);
    const [replayIndex, setReplayIndex] = useState<number | null>(null);
    const [pausedState, setPausedState] = useState<ExecutionState | null>(
        () => {
            if (!workflow) return null;
            return options.persist?.load(hashWorkflow(workflow)) ?? null;
        },
    );

    const abortRef = useRef<AbortController | null>(null);
    const lastInputsRef = useRef<Record<string, unknown>>({});
    const stateHistoryRef = useRef<ExecutionState[]>([]);
    const replayIndexRef = useRef<number | null>(null);

    // Keep refs in sync with state.
    stateHistoryRef.current = stateHistory;
    replayIndexRef.current = replayIndex;

    // Clear paused state when the workflow definition changes.
    const prevWorkflowHashRef = useRef<string | null>(
        workflow ? hashWorkflow(workflow) : null,
    );
    useEffect(() => {
        if (!workflow) return;
        const hash = hashWorkflow(workflow);
        if (
            prevWorkflowHashRef.current &&
            prevWorkflowHashRef.current !== hash
        ) {
            setPausedState(null);
            options.persist?.clear(prevWorkflowHashRef.current);
        }
        prevWorkflowHashRef.current = hash;
    }, [workflow, options.persist]);

    const startStreaming = useCallback(
        async (
            inputs: Record<string, unknown>,
            initialState?: ExecutionState,
        ) => {
            if (!workflow) return;

            const ac = new AbortController();
            abortRef.current = ac;
            const wfHash = hashWorkflow(workflow);

            try {
                const iterableOrPromise = options.execute({
                    workflow,
                    inputs,
                    initialState,
                });
                const iterable =
                    iterableOrPromise instanceof Promise
                        ? await iterableOrPromise
                        : iterableOrPromise;

                for await (const state of iterable) {
                    if (ac.signal.aborted) break;
                    setStateHistory((prev) => {
                        const next = [...prev, state];
                        stateHistoryRef.current = next;
                        return next;
                    });
                    // Only update the visible state if not in replay mode.
                    if (replayIndexRef.current === null) {
                        setExecutionState(state);
                    }
                }
            } catch (err) {
                if (!ac.signal.aborted) {
                    console.error("Workflow execution error:", err);
                }
            } finally {
                if (!ac.signal.aborted) {
                    setIsRunning(false);
                    options.persist?.clear(wfHash);
                }
                abortRef.current = null;
            }
        },
        [workflow, options],
    );

    const run = useCallback(
        (inputs?: Record<string, unknown>) => {
            if (!workflow || isRunning) return;
            const resolvedInputs = inputs ?? {};
            lastInputsRef.current = resolvedInputs;

            // Clear any prior state.
            setPausedState(null);
            if (workflow) options.persist?.clear(hashWorkflow(workflow));
            setExecutionState(null);
            setStateHistory([]);
            stateHistoryRef.current = [];
            setReplayIndex(null);
            setIsRunning(true);

            startStreaming(resolvedInputs);
        },
        [workflow, isRunning, startStreaming, options],
    );

    const pause = useCallback(() => {
        if (!workflow || !isRunning) return;
        const wfHash = hashWorkflow(workflow);
        const latest =
            stateHistoryRef.current[stateHistoryRef.current.length - 1] ?? null;
        if (latest) {
            options.persist?.save(wfHash, latest);
            setPausedState(latest);
        }
        abortRef.current?.abort();
        setIsRunning(false);
    }, [workflow, isRunning, options]);

    const resume = useCallback(() => {
        if (!workflow || !pausedState || isRunning) return;
        setPausedState(null);
        setReplayIndex(null);
        setIsRunning(true);
        startStreaming(lastInputsRef.current, pausedState);
    }, [workflow, pausedState, isRunning, startStreaming]);

    const reset = useCallback(() => {
        abortRef.current?.abort();
        setExecutionState(null);
        setStateHistory([]);
        stateHistoryRef.current = [];
        setReplayIndex(null);
        setIsRunning(false);
        setPausedState(null);
        if (workflow) options.persist?.clear(hashWorkflow(workflow));
    }, [workflow, options]);

    const seekTo = useCallback((index: number) => {
        const isAtEnd = index === stateHistoryRef.current.length - 1;
        setReplayIndex(isAtEnd ? null : index);
        const target = stateHistoryRef.current[index];
        if (target) setExecutionState(target);
    }, []);

    const goLive = useCallback(() => {
        setReplayIndex(null);
        const latest =
            stateHistoryRef.current[stateHistoryRef.current.length - 1] ?? null;
        setExecutionState(latest);
    }, []);

    return {
        executionState,
        stateHistory,
        isRunning,
        isPaused: !!pausedState,
        run,
        pause,
        resume,
        reset,
        replayIndex,
        seekTo,
        goLive,
    };
}

import type { ExecutionState } from "./state";

// ─── Interfaces ──────────────────────────────────────────────────

/** Options for configuring a {@link BaseExecutionStateChannel}. */
export interface WorkflowExecutionStateChannelOptions {
  debounce?: {
    /** Minimum interval in milliseconds between emitted states. */
    ms: number;
    /** Always flush terminal states (`completed` / `failed`) immediately, bypassing the debounce window. Defaults to `true`. */
    flushOnComplete?: boolean;
  };
}

/** Pub/sub channel for streaming {@link ExecutionState} snapshots from an executor to one or more consumers. */
export interface WorkflowExecutionStateChannel {
  /** Push a new state snapshot into the channel. */
  publish(state: ExecutionState): void;
  /** Signal that no more states will be published. Subscribers will drain and terminate. */
  close(): void;
  /**
   * Subscribe to state updates.
   *
   * - Default (`replay: false`): yields the latest state immediately (if any), then follows live.
   * - `replay: true`: yields the full history from the beginning, then follows live.
   */
  subscribe(opts?: { replay?: boolean }): AsyncIterable<ExecutionState>;
  /** Returns the most recent state, or `null` if none has been published. */
  latest?(): Promise<ExecutionState | null>;
}

// ─── Base Class ──────────────────────────────────────────────────

const TERMINAL_STATUSES = new Set(["completed", "failed"]);

/**
 * Abstract base that handles debounce logic so subclasses only implement
 * {@link emit}, {@link doClose}, and {@link subscribe}.
 */
export abstract class BaseExecutionStateChannel
  implements WorkflowExecutionStateChannel
{
  private readonly debounceMs: number | undefined;
  private readonly flushOnComplete: boolean;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private bufferedState: ExecutionState | null = null;

  constructor(options?: WorkflowExecutionStateChannelOptions) {
    this.debounceMs = options?.debounce?.ms;
    this.flushOnComplete = options?.debounce?.flushOnComplete ?? true;
  }

  /** Push a state snapshot, applying debounce if configured. */
  publish(state: ExecutionState): void {
    if (this.debounceMs === undefined) {
      this.emit(state);
      return;
    }

    // Terminal states flush immediately when configured.
    if (this.flushOnComplete && TERMINAL_STATUSES.has(state.status)) {
      this.clearDebounce();
      this.emit(state);
      return;
    }

    this.bufferedState = state;
    if (this.debounceTimer === null) {
      this.debounceTimer = setTimeout(() => {
        this.debounceTimer = null;
        if (this.bufferedState) {
          const s = this.bufferedState;
          this.bufferedState = null;
          this.emit(s);
        }
      }, this.debounceMs);
    }
  }

  /** Close the channel, flushing any buffered state first. */
  close(): void {
    this.clearDebounce();
    if (this.bufferedState) {
      const s = this.bufferedState;
      this.bufferedState = null;
      this.emit(s);
    }
    this.doClose();
  }

  private clearDebounce(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  /** Deliver a state snapshot to subscribers. Subclasses implement storage + notification. */
  protected abstract emit(state: ExecutionState): void;
  /** Perform subclass-specific close logic (e.g. resolve pending waiters). */
  protected abstract doClose(): void;

  abstract subscribe(opts?: {
    replay?: boolean;
  }): AsyncIterable<ExecutionState>;

  /** Returns the most recent state. Override in subclasses that track history. */
  latest(): Promise<ExecutionState | null> {
    return Promise.resolve(null);
  }
}

// ─── In-Memory Implementation ────────────────────────────────────

/**
 * A simple in-memory channel that buffers all published states in an array.
 * Suitable for single-process use (e.g. {@link executeWorkflowStream}).
 */
export class MemoryExecutionStateChannel extends BaseExecutionStateChannel {
  private readonly states: ExecutionState[] = [];
  private readonly waiters: Array<() => void> = [];
  private closed = false;

  protected emit(state: ExecutionState): void {
    this.states.push(state);
    // Wake all waiting subscribers.
    const pending = this.waiters.splice(0);
    for (const resolve of pending) {
      resolve();
    }
  }

  protected doClose(): void {
    this.closed = true;
    const pending = this.waiters.splice(0);
    for (const resolve of pending) {
      resolve();
    }
  }

  override latest(): Promise<ExecutionState | null> {
    return Promise.resolve(
      this.states.length > 0
        ? (this.states[this.states.length - 1] ?? null)
        : null,
    );
  }

  subscribe(opts?: { replay?: boolean }): AsyncIterable<ExecutionState> {
    const channel = this;

    async function* generator(): AsyncGenerator<ExecutionState> {
      let cursor: number;

      if (opts?.replay) {
        // Replay: yield everything from the start.
        cursor = 0;
      } else {
        // Default: yield only the latest state (if any), then follow live.
        cursor = Math.max(0, channel.states.length - 1);
      }

      while (true) {
        // Yield all buffered states from cursor.
        while (cursor < channel.states.length) {
          // biome-ignore lint/style/noNonNullAssertion: cursor is bounds-checked by the while condition
          yield channel.states[cursor]!;
          cursor++;
        }

        // If the channel is closed and we've drained the buffer, we're done.
        if (channel.closed) return;

        // Wait for the next emit or close.
        await new Promise<void>((resolve) => {
          channel.waiters.push(resolve);
        });
      }
    }

    return generator();
  }
}

import type { ExecutionRun } from "../types";

/**
 * A durable host's implementation of the run primitives — the seam for a
 * platform that owns its own journal and its own suspend/resume (AWS Lambda
 * durable functions, Temporal, Restate). Unlike a
 * {@link CheckpointStore}, an adapter is handed control flow: its `step` decides
 * whether to execute or replay, and its `sleep` may end the invocation entirely
 * and be resumed by the host later.
 *
 * Because the host starts the execution, an adapter is constructed per
 * invocation from whatever context the host passes the handler, and
 * `getExecutionInfo` reports the host's ids rather than minting new ones.
 *
 * Structurally identical to {@link ExecutionRun} by design: a workflow needs no
 * different primitives to become durable. What differs is the contract behind
 * them — see {@link createDurableExecutionEngine} for the determinism the host
 * requires in exchange.
 */
export type DurableExecutionAdapter = ExecutionRun;

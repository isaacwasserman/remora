---
"@remoraflow/core": minor
---

Split workflow execution into an in-memory engine (the default) and opt-in checkpointing and durable engines, so the API no longer implies durability it doesn't provide.

- `executionOptions.durableExecutionAdapter` is now `executionOptions.executionEngine`, and defaults to `createInMemoryExecutionEngine()` — steps run in-process with nothing recorded, so a re-invoked run starts over. Pass `{ checkpointing: true }` to record results in a process-local map (useful for exercising replay in tests).
- `createCheckpointingExecutionEngine(store)` takes a `CheckpointStore` (`load`/`save`) that the caller supplies. Checkpoints let a run re-invoked with the same `runId` skip completed steps — nothing here detects or restarts a crashed run, and `sleep` holds the process open.
- `createDurableExecutionEngine(adapter)` takes a `DurableExecutionAdapter` — the run-shaped seam a host with its own journal implements. `step` and `sleep` delegate to the host, so a `sleep` can suspend the invocation and be resumed later.
- `createLambdaDurableExecutionAdapter(context)` implements `DurableExecutionAdapter` on top of the AWS Lambda Durable Execution SDK: steps delegate to `context.step` with retry policy translated, sleeps to `context.wait`.
- Removed the SQLite adapter (`createSqliteDurableExecutionAdapter`).
- Renamed, dropping the "durable" claim outside the durable engine: `DurableContext` → `ExecutionContext`, `createDurableContext` → `createExecutionContext`, `DurableExecutor` → `ExecutionRun`, and the old `DurableExecutionAdapter` (KV store) → `CheckpointStore`. Step retry/timeout policy is now shared by every engine via `resolveRetryPolicy`.

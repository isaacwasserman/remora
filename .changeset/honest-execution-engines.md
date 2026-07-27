---
"@remoraflow/core": minor
---

Split workflow execution into an in-memory engine (the default) and an opt-in durable one, so the API no longer implies durability it doesn't provide.

- `executionOptions.durableExecutionAdapter` is now `executionOptions.executionEngine`, and defaults to `createInMemoryExecutionEngine()` — steps run in-process with nothing recorded, so a re-invoked run starts over. Pass `{ checkpointing: true }` to record results in a process-local map (useful for exercising replay in tests).
- `createDurableExecutionEngine(adapter)` replaces `createDurableExecutionAdapter(store)`. It takes a `DurableExecutionAdapter` (`load`/`save`) that the caller supplies; this package ships no durable backend. Checkpoints let a run re-invoked with the same `procedureId` + `runId` skip completed steps — nothing here detects or restarts a crashed run.
- Removed the SQLite adapter (`createSqliteDurableExecutionAdapter`).
- Renamed, dropping the "durable" claim outside the durable engine: `DurableContext` → `ExecutionContext`, `createDurableContext` → `createExecutionContext`, `DurableExecutor` → `ExecutionRun`, and the old `DurableExecutionAdapter` (run factory) → `ExecutionEngine`. Step retry/timeout policy is now shared by every engine.

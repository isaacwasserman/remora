---
"@remoraflow/core": minor
---

Simplify execution state channels: collapse `WorkflowExecutionStateChannel` interface and `BaseExecutionStateChannel` into a single `ExecutionStateChannel` abstract class, and remove the `replay` option from `subscribe()` since each `ExecutionState` is already a complete snapshot.

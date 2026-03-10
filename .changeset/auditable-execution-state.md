---
"@isaacwasserman/remora": minor
---

Add auditable execution state tracking to the workflow executor and visualization support in the viewer.

- New `ExecutionState` schema (arktype) tracks full execution history including step records, timing, outputs, errors, retries, and execution paths for branches/loops
- New `onStateChange(state, delta)` callback on `executeWorkflow` emits structured state changes with idempotent deltas for incremental database updates
- `ExecutionResult` now includes `executionState` field with the final execution state
- Pure `applyDelta` reducer for reconstructing/verifying state from deltas
- `WorkflowViewer` accepts optional `executionState` prop to visualize run progress on the DAG with status rings, icons, executed path highlighting, and execution details in the step detail panel

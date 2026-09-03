---
"@remoraflow/core": patch
---

`createWorkflowDefinitionSchema` now accepts partial `RemoraflowSettings` and resolves defaults internally, so callers no longer need to pre-resolve settings.

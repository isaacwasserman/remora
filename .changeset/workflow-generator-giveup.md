---
"@remoraflow/core": minor
---

`generateWorkflow` now exposes a `giveUp` tool to the LLM so it can explicitly signal that a task cannot be expressed as a workflow over the provided tools. When the agent calls `giveUp`, the generator stops immediately and returns the reason on the new `giveUpReason` field of `GenerateWorkflowResult`. This lets callers distinguish "the model determined the task is infeasible" from "the model exhausted retries on compile errors".

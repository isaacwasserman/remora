---
"@remoraflow/core": minor
---

`generateWorkflow` now exposes a `giveUp` tool to the LLM so it can explicitly signal that a task cannot be expressed as a workflow over the provided tools. The tool requires both a categorical `code` (one of `missing-capability`, `ambiguous-task`, `not-workflow-shaped`, `infeasible`, `unsafe`, `other`) and a free-form `reason`.

`GenerateWorkflowResult` has been extended with:
- `success: boolean` — whether a valid workflow was produced.
- `failureCode?: WorkflowFailureCode` — categorical failure reason (the agent's give-up code, or `compile-errors-exhausted` when the retry budget runs out).
- `failureMessage?: string` — free-form explanation (from the agent's `giveUp` reason, or formatted compile diagnostics).

New exports: `WorkflowGiveUpCode`, `WorkflowFailureCode`, `WORKFLOW_GIVE_UP_CODES`.

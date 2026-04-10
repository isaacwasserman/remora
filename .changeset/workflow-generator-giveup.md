---
"@remoraflow/core": minor
---

`generateWorkflow` now exposes a `giveUp` tool to the LLM so it can explicitly signal that a task cannot be expressed as a workflow over the provided tools. The tool requires both a categorical `code` (one of `missing-capability`, `ambiguous-task`, `not-workflow-shaped`, `infeasible`, `unsafe`, `other`) and a free-form `reason`.

`GenerateWorkflowResult` is now a discriminated union on `success`:
- **Success** (`success: true`): `workflow` is a non-null `WorkflowDefinition`; failure fields are `undefined`.
- **Failure** (`success: false`): `workflow` is `null`; `failureCode: WorkflowFailureCode` and `failureMessage: string` are both populated. `failureCode` is either one of the agent-emitted give-up codes, or `compile-errors-exhausted` when the retry budget runs out.

TypeScript now correctly narrows the result after `if (result.success)`.

New exports: `GenerateWorkflowSuccess`, `GenerateWorkflowFailure`, `WorkflowGiveUpCode`, `WorkflowFailureCode`, `WORKFLOW_GIVE_UP_CODES`.

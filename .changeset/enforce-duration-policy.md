---
"@remoraflow/core": minor
---

Enforce `durationPolicy` during execution.

Every duration bound in `remoraflowOptionsSchema.durationPolicy` is now applied
at runtime, not just when validating a workflow definition. Bounds are composed
in one place (`resolveDurationLimits` — a sleep cannot outlast the wait budget
containing it, and no wait can outlast the run) and enforced in one place
(`createExecutionContext`), so a limit cannot mean one thing at authoring time
and another during a run.

- A wait on a supervisor who never answers is now bounded by `maxWaitSeconds`.
  Previously `request-intervention` polled indefinitely.
- Runs that exceed `maxDurationSeconds` or `maxExecutionSeconds` end with a
  terminal `DURATION_LIMIT_EXCEEDED` error instead of running on. Both budgets
  survive a resume: the wall clock is anchored through a recorded step, and each
  step's elapsed time is recorded under it, so a resumed durable run inherits
  the original start and recharges what earlier attempts spent rather than
  granting itself a fresh budget.
- Every step now carries a `maxStepExecutionSeconds` timeout.
- Poll intervals below `minPollIntervalSeconds` are raised to it.

Breaking changes to `ExecutionOptions`:

- `maxSleepSeconds` and `maxLLMPromptTokens` are removed. Pass
  `policy: { durationPolicy: { maxSleepSeconds } }` instead;
  `maxLLMPromptTokens` had no readers. The old `maxSleepSeconds` defaulted to
  3600 and silently clamped, disagreeing with `durationPolicy.maxSleepSeconds`;
  there is now a single value.
- `createExecutionContext(run)` takes a required second argument, the duration
  policy.
- `validateWorkflowDefinition`'s context accepts an optional resolved `options`,
  defaulting to the shipped policy.
- Step ids may no longer begin with `__`. The runtime keeps its own checkpoint
  keys under a reserved `__remoraflow` path segment (`__remoraflow.startedAt`,
  `<step>.__remoraflow.wakeAt`, and so on), and the prefix ban is what makes
  that namespace uncollidable. Checkpoint keys for in-flight durable runs change
  accordingly, so a run mid-flight across this upgrade will restart rather than
  resume.

# Todos
- Add lambda adapter
- Unified options (`remoraflowOptionsSchema`) passed to the generator (to be
  implemented), validator, and executor
    - DONE: the options spine, and all of `durationPolicy`. Bounds are composed
      in one place (`resolveDurationLimits`) and enforced in one place
      (`createExecutionContext`); the validator rejects out-of-bound literals
      and the runtime clamps values that reach it through expressions.
    - Global step retry policy, applied to every `executionContext.step` call.
      `timeoutSeconds` is now always set from `maxStepExecutionSeconds`, but the
      retry half is still unused, so every step runs `maxAttempts: 1`.
        - maxAttempts: number
        - retryDelaySeconds: number
    - LLM budgets, currently hardcoded in `step-executors.ts`
        - maxDataTokens: number (extract-data data-comprehension budget)
        - maxAgentSteps: number (agent-loop / extract-data step budget)
        - maxTokenUsage: { input: number, output: number, total: number }
          (whole-workflow ceiling, the cost analogue of maxDurationSeconds)
    - Structural limits, enforced by the validator and communicated to the generator
        - maxSteps: number
        - maxNestingDepth: number
        - maxLoopIterations: number
    - Output/log caps
        - maxToolOutputBytes: number — throws when a tool result exceeds it
        - maxLogLines: number — drops the oldest lines instead of throwing, so
          log capture stops growing without bound
    - Every option above needs a documented default
- Add a prompt truncation model middleware

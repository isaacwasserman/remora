# Todos
- Add lambda adapter
- Ensure proper backoff and timeouts on all suspends/polls
- Add a unified set of options that get passed to the generator (to be implemented), validator, and executor
    - allowUserIntervention: boolean
        - When false:
            - Excludes step type from generator
            - Errors when encountering step type in generator
    - maxWorkflowSeconds: number
        - How long the entire workflow can run before timeout (includes sleep and wait time)
    - maxDurationSeconds: number
        - How long the entire workflow can run before timeout (excludes sleep and wait time)
    - maxSleepSeconds: number
        - How long sleep steps can last before timeout
        - In generator, informs author
        - In validator, errors for longer sleeps
        - In executor, errors rather than clamping (today it silently clamps)
    - maxWaitSeconds: number
        - How long each waitFor can last before timeout
        - Must cover "ask-supervisor", which calls `waitFor` with no options, so
          today nothing bounds a wait on a supervisor who never answers.
          Deliberately NOT adding a per-step timeout to
          `askSupervisorParamsSchema` — the bound should arrive with this
          unified options set rather than as a one-off on that step.
    - minPollInterval: number
    - Global step retry/timeout policy, applied to every `executionContext.step`
      call. `StepOptions` already supports these in `execution-engine/run-step.ts` but no
      call site passes them, so every step runs `maxAttempts: 1` with no timeout.
        - maxAttempts: number
        - retryDelaySeconds: number
        - timeoutSeconds: number (per step, excludes sleep and wait time)
    - LLM budgets, currently hardcoded in `step-executors.ts`
        - maxDataTokens: number (extract-data data-comprehension budget)
        - maxAgentSteps: number (agent-loop / extract-data step budget)
        - maxLLMPromptTokens: number (declared in `ExecutionOptions` but unused)
        - maxTokenUsage: { input: number, output: number, total: number }
          (whole-workflow ceiling, the cost analogue of maxWorkflowSeconds)
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
- Ensure the errors we throw intentionally during execution don't trigger
  retries — they're unrecoverable. Likely an `UnrecoverableError` base class that
  the retry logic catches and rethrows without retrying.

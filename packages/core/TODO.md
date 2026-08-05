# Todos
- Add a public entry point (src/index.ts is empty)
- Implement generateWorkflow() (currently throws "NOT IMPLEMENTED")
- Redesign the policy/approval system (core-old had Policy[], approve/reject/defer/request-approval; shape TBD)
- Export executeWorkflow's execution state types publicly, and make the return shape compatible with core-old's ExecutionResult (stepOutputs, typed error, etc.)
- Export a typed error hierarchy (core-old had StepExecutionError subclasses with ErrorCode/ErrorCategory/RecoveryStrategy)
- Export a static maximally-lenient workflowDefinitionSchema (no runtime limits baked in)
- Unified options (`remoraflowOptionsSchema`) passed to the generator (to be
  implemented), validator, and executor
    - DONE: the options spine, and all of `durationPolicy`. Bounds are composed
      in one place (`resolveDurationLimits`) and enforced in one place
      (`createExecutionContext`); the validator rejects out-of-bound literals
      and the runtime clamps values that reach it through expressions.
    - DONE: Global step retry policy (`maxAttempts`, `retryDelaySeconds`) wired
      through `createExecutionContext` as defaults for every `policedStep` call;
      per-step options override. Failed step charges now persisted to the store.
    - Done: LLM budgets, currently hardcoded in `step-executors.ts`
        - maxDataTokens: number (extract-data data-comprehension budget)
        - maxAgentSteps: number (agent-loop / extract-data step budget)
    - Structural limits, enforced by the validator and communicated to the generator
        - DONE: maxSteps: number
        - DONE: maxNestingDepth: number
        - DONE: maxLoopIterations — enforced in the `for-each` executor rather
          than the validator, since an expression target is only known at
          runtime. Raises `LoopIterationLimitExceededError` before the first
          iteration.
        - DONE: `structural-limit` validation module registered in the pipeline
    - Output/log caps
        - maxToolOutputBytes: number — defined in the schema but not consumed
          by any executor or middleware. Must be enforced in `tool-runner.ts`.
        - maxLogLines: number — drops the oldest lines instead of throwing, so
          log capture stops growing without bound
    - DONE: Every option above needs a documented default
- DONE: Add a prompt truncation model middleware
- Add while step
- Add accumulators to loops
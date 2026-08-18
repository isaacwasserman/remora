---
"@remoraflow/core": minor
---

Enforce `structuralLimits.maxLoopIterations` at runtime. A `for-each` step whose target resolves to more elements than the limit allows now fails the run with a new `LOOP_ITERATION_LIMIT_EXCEEDED` error before any iteration executes, rather than running the loop unbounded. A limit of `0` still means unlimited.

The limit is checked in the executor because a target reaching the runtime through an expression is invisible to the validator. Like a duration overage the error is unrecoverable: it is not retried, and an enclosing `for-each` forwards it rather than remapping it onto its own error code. It carries a `path` naming the offending `for-each` step — the innermost one, when loops are nested.

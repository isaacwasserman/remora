---
"@remoraflow/core": patch
---

Capture each execution's logs from its own async context instead of hooking and unhooking `process.stdout` and `process.stderr` per run. Concurrent executions in one process no longer see each other's output or leave stale hooks behind, output written outside an execution (including by the caller between states) is no longer recorded, and a write silenced by `silenceLogs` now completes its callback. Drops the `capture-console` dependency.

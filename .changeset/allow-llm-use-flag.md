---
"@remoraflow/core": minor
---

Add the `features.allowLlmUse` setting (default `true`). When `false`, the `agent-loop`, `llm-prompt`, and `extract-data` step types are removed from the workflow schema and rejected at run time, even if `allowAgentLoops` is `true`.

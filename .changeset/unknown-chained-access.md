---
"@remoraflow/core": patch
---

Keep unknown types through chained JMESPath field and index accesses, including union alternatives. Expressions such as `step.results[0].X` on a tool with a bare object output schema now warn that they may resolve to null instead of incorrectly blocking workflow execution.

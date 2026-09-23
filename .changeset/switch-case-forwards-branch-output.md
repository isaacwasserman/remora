---
"@remoraflow/core": minor
---

A `switch-case` step's output is now the value returned by its selected branch, instead of `null`. The validator types it as the union of the branch outputs. Field access on a union type no longer warns when every member of the union has the field.

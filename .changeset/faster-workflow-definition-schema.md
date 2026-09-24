---
"@remoraflow/core": patch
---

The workflow definition schema is about twice as fast to build, because the union of step types is now built in one call instead of a chain of `.or()` and `.exclude()` calls.

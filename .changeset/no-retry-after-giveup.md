---
"@remoraflow/core": patch
---

Fix extract-data give-up not stopping retries. When the LLM calls give-up during a retry attempt, the ExtractionError is now thrown immediately instead of being swallowed by the retry loop. Also reclassifies ExtractionError from `output-quality` to a new `extraction` error category.

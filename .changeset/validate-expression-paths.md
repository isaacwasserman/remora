---
"@remoraflow/core": minor
---

Add compiler pass to validate property paths in JMESPath expressions against known output schemas. The new `JMESPATH_INVALID_PROPERTY_PATH` warning catches references to non-existent properties (e.g., `${step.data}` when the step output only has `result`), with hints listing available properties.

---
"@remoraflow/core": patch
---

Fix false `JMESPATH_FORWARD_REFERENCE` warning when a step downstream of a `wait-for-condition` references a step in its `conditionStepId` body chain. The static analyzer now models the fact that the body chain runs at least once before control proceeds past the wait-for-condition, so its outputs are visible to subsequent steps.

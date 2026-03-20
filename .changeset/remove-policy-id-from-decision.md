---
"@remoraflow/core": patch
---

Remove `sourcePolicyId` from `PolicyDecision` return type. The executor now derives it from the policy's `id` field during evaluation, ensuring it always matches the actual policy ID.

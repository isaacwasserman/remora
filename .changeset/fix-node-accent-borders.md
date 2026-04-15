---
"@remoraflow/ui": patch
---

Fix package styles overriding host application CSS by keeping utilities inside `@layer remoraflow` with `important: true` so they beat host CSS resets without raising baseline specificity

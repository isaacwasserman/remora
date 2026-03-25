---
"@remoraflow/ui": patch
---

Restore `@xyflow/react/dist/style.css` side-effect import so downstream bundlers automatically include xyflow's base styles (z-index, positioning, pointer-events) without requiring an explicit `@remoraflow/ui/styles.css` import

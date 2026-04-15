---
"@remoraflow/ui": minor
---

Replace hardcoded theme with CSS variable mapping for host-app compatibility. Tailwind imports wrapped in `@layer remoraflow` to prevent specificity collisions. React Flow styled via `--xy-*` CSS variables instead of JS-based `useThemeColors`. Smarter initial node height estimation prevents layout thrash on first render.

---
"@isaacwasserman/remora": minor
---

Add shadcn component registry for workflow viewer and step detail panel

- Decouple `StepDetailPanel` from `WorkflowViewer` so they can be used independently
- Export `StepDetailPanel` and `StepDetailPanelProps` from `@isaacwasserman/remora/viewer`
- Change `onStepSelect` callback to pass full step and diagnostics instead of just step ID
- Add registry build script that generates shadcn-compatible JSON served via GitHub Pages
- Components installable via `npx shadcn@latest add https://isaacwasserman.github.io/remora/r/workflow-viewer.json`

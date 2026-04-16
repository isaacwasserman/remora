---
"@remoraflow/ui": patch
---

Include `tool-schemas-context` in the shadcn component registry for both `workflow-viewer` and `workflow-step-detail-panel`. Previously the file was missing, so the registry emitted files that imported `useToolSchemas`/`useToolDisplayName`/`ToolSchemasContext` from `@remoraflow/ui`, which broke consumers who installed via the registry without the package. The registry build now also errors out on any viewer-internal import that is not explicitly listed, so this class of bug fails the build instead of shipping.

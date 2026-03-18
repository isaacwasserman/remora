# @remoraflow/ui

## 0.2.0

### Minor Changes

- 4d432fc: Add workflow editing capabilities to WorkflowViewer with new `isEditing`, `onWorkflowChange`, and `tools` props. When editing is enabled, users can add steps from a palette or context menu, edit step properties in a side panel, drag to reposition nodes, connect/disconnect steps, and delete steps. Supports creating workflows from scratch with a null workflow prop. New exports: `StepEditorPanel`, `ExpressionEditor`, `buildEditableLayout`, `createDefaultStep`, `resetStepCounter`.
- 46dda57: Restructure into Bun workspace monorepo with independent package directories. Rename packages to @remoraflow/core and @remoraflow/ui, both starting at 0.1.0 with synchronized versioning via changesets `fixed` configuration.

### Patch Changes

- be08d81: Publish interactive demo app to GitHub Pages alongside documentation. Add demo links to docs navbar, homepage, and README.
- f70ce65: Fix AI SDK tool() syntax in docs and simplify step-detail-panel component. Updated documentation examples from 'parameters' to 'inputSchema' to match AI SDK v6 API. Removed unused code from step-detail-panel.tsx.
- 8b4d516: Fix typedoc module names to generate correct API documentation paths. Added @module JSDoc tags to entry points so docs links resolve correctly.
- Updated dependencies [4d432fc]
- Updated dependencies [be08d81]
- Updated dependencies [f70ce65]
- Updated dependencies [8b4d516]
- Updated dependencies [46dda57]
  - @remoraflow/core@0.2.0

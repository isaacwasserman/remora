# @remoraflow/ui

## 0.11.1

### Patch Changes

- 93ccb6d: Fix three shadcn component registry bugs that broke installs:

  - The registry import-rewriter kept relative paths (e.g. `../../components/ui/combobox`) for any file shipped by the registry, including `registry:ui` files. shadcn relocates `registry:ui` files to the consumer's ui alias, so those sibling-relative imports failed to resolve after install. Imports that resolve under `components/ui/` or `lib/` are now always rewritten to the `@/` alias.
  - Renamed the custom `combobox.tsx` ui primitive to `workflow-combobox.tsx` so it no longer overwrites the consumer's existing `ui/combobox.tsx` (shadcn's public registry has no combobox, so every consumer's combobox is a roll-your-own at that path). The exported `Combobox*` names from `@remoraflow/ui` are unchanged.
  - The `workflow-step-detail-panel` registry item duplicated six files already shipped by `workflow-viewer`, so installing both produced two copies of every shared file. The panel item now declares `workflow-viewer` as a `registryDependencies` entry and ships no files of its own.

- de7f094: Fix switch-case edges with empty `branchBodyStepId` targets in the graph layout. When a case's `branchBodyStepId` is `""` (e.g. from a newly-added case/default or after `clearChildRef`), the layout no longer emits an edge pointing at the non-existent node id `""`.
- Updated dependencies [8c844da]
  - @remoraflow/core@0.11.1

## 0.11.0

### Minor Changes

- 586e13a: Rewrite the `Combobox` component on top of Radix Popover + `cmdk`, matching the
  rest of the shadcn primitives in the registry and dropping the `@base-ui/react`
  dependency. Also ships standard shadcn `Popover`, `Command`, and `Dialog`
  primitives so the combobox composes cleanly.

  **Breaking**: the combobox now uses a trigger + popover + command-list
  composition (matching the shadcn docs example). The `items` / `value` /
  `onValueChange` render-prop API, chip primitives (`ComboboxChips`,
  `ComboboxChip`, `ComboboxChipsInput`), and the `useComboboxAnchor` helper are
  removed. Use `<ComboboxTrigger>` to display the selected value, wrap
  `ComboboxItem`s in a `ComboboxGroup`, and handle selection with `onSelect` on
  each item.

- d626857: Revert `select.tsx` to the standard shadcn version and introduce a new `Combobox` component. The combobox is built on `@base-ui/react` following the shadcn Combobox guide and supports items with values, labels, and descriptions (`ComboboxItemTitle`, `ComboboxItemDescription`). The tool-call step editor now uses the combobox for tool selection. The combobox ships as part of the `workflow-viewer` registry item.

### Patch Changes

- 9828c50: Fix React Flow controls (zoom in/out/fit-view) not respecting dark mode when the host app toggles `dark` on `<html>`. The workflow viewer now forwards its detected color mode to React Flow via the `colorMode` prop so the built-in controls styling picks up the correct dark palette.
  - @remoraflow/core@0.11.0

## 0.10.1

### Patch Changes

- dec6961: Include `tool-schemas-context` in the shadcn component registry for both `workflow-viewer` and `workflow-step-detail-panel`. Previously the file was missing, so the registry emitted files that imported `useToolSchemas`/`useToolDisplayName`/`ToolSchemasContext` from `@remoraflow/ui`, which broke consumers who installed via the registry without the package. The registry build now also errors out on any viewer-internal import that is not explicitly listed, so this class of bug fails the build instead of shipping.
  - @remoraflow/core@0.10.1

## 0.10.0

### Minor Changes

- 1b2f718: The tool-call editor now handles optional tool inputs properly. When a tool is selected, only required inputs are auto-populated. Optional inputs from the schema appear as "+ key" chips that the user can add on demand, and added optional inputs show a remove button so they can be dropped back to unset.
- cb0af5e: Preserve JSON Schema `default` values from tool input schemas. `extractToolSchemas` now prefers the validator library's native `toJsonSchema` / `toJSONSchema` method (e.g. arktype, zod v4) when available, so extensions like `default`, `examples`, and `title` are no longer stripped by the AI SDK's `asSchema` wrapper.

  The workflow viewer surfaces defaults in the tool-call editor:

  - Shown as placeholder text in string, number, JSON, and enum inputs.
  - Rendered next to the "+ key" chip for absent optional inputs.
  - Displayed as a subtle `default: …` label next to present optional inputs.
  - When the user clicks the chip to add an optional input, the input is seeded with the schema's default value (if set) instead of an empty literal.

- ea69942: Add optional `displayName` to `ToolSchemaDefinition`. The workflow viewer now uses it as the human-friendly label for tools in the tool picker, agent-loop tool list, node canvas, and detail/editor panels. Compiled workflows continue to reference tools by their actual keys. The tool picker dropdown also renders each tool's description underneath its name.

### Patch Changes

- Updated dependencies [cb0af5e]
- Updated dependencies [ea69942]
  - @remoraflow/core@0.10.0

## 0.9.0

### Minor Changes

- e521599: Add `layout` prop to `WorkflowViewer` for controlling DAG direction (`"vertical"` or `"horizontal"`). Also export the `LayoutDirection` type and accept a `direction` parameter in `buildLayout`/`buildEditableLayout`.

### Patch Changes

- ca01a58: Revert `rf:` class prefix that broke host app styling; restore utilities to `@layer remoraflow`
  - @remoraflow/core@0.9.0

## 0.8.0

### Minor Changes

- 6dc6aea: Replace hardcoded theme with CSS variable mapping for host-app compatibility. Tailwind imports wrapped in `@layer remoraflow` to prevent specificity collisions. React Flow styled via `--xy-*` CSS variables instead of JS-based `useThemeColors`. Smarter initial node height estimation prevents layout thrash on first render.

### Patch Changes

- Updated dependencies [499f437]
- Updated dependencies [8538813]
  - @remoraflow/core@0.8.0

## 0.7.1

### Patch Changes

- Updated dependencies [642e815]
  - @remoraflow/core@0.7.1

## 0.7.0

### Patch Changes

- Updated dependencies [ec262b9]
  - @remoraflow/core@0.7.0

## 0.6.0

### Patch Changes

- 9934958: Auto-load compiled CSS via side-effect import so downstream apps get all required styles (xyflow base, Tailwind utilities, theme) without needing an explicit `@remoraflow/ui/styles.css` import
- cfe9fd0: Restore `@xyflow/react/dist/style.css` side-effect import so downstream bundlers automatically include xyflow's base styles (z-index, positioning, pointer-events) without requiring an explicit `@remoraflow/ui/styles.css` import
- Updated dependencies [eda0cc6]
  - @remoraflow/core@0.6.0

## 0.5.0

### Minor Changes

- 60e1f69: Ship compiled CSS with the package for zero-config styling support.

  **New:** `import '@remoraflow/ui/styles.css'` — npm consumers should add this import to get all Tailwind utility classes and sensible default theme variables. Without it, compound utility classes (e.g. `dark:shadow-foreground/[0.06]`, `bg-muted-foreground/70`, `data-[state=active]:bg-foreground`) won't have matching CSS rules in consuming apps that don't scan `node_modules`.

  The shipped CSS includes default light/dark theme variables that work out of the box. Consumers using shadcn/ui can override these by defining their own CSS variables. For full theme control, add `@source` for the package in your Tailwind CSS config.

  **New props:**

  - `WorkflowViewer`: added `hideDetailPanel` prop to suppress the built-in detail/editor panel, allowing consumers to render `StepDetailPanel` or `StepEditorPanel` externally without duplication.

  **New exports:**

  - `StepPalette` and `StepPaletteProps` are now exported for external rendering.

### Patch Changes

- @remoraflow/core@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [7d2ed12]
  - @remoraflow/core@0.4.0

## 0.3.0

### Minor Changes

- 7137e3c: Add optional `toolSchemas` prop to `WorkflowViewer` to accept pre-extracted tool metadata directly, enabling server-side tool definitions. Move demo tools to server-side with SSRF-hardened fetch tool featuring DNS rebinding detection, port/IP restrictions, rate limiting, and response size limits.
- 8080391: Add WorkflowExecutionStateChannel abstraction for flexible state publishing, `executeWorkflowStream` convenience helper, `useWorkflowExecution` React hook for managing execution lifecycle with pause/resume and replay capabilities, and `ReplaySlider` component. Includes full React Testing Library integration with 10 hook tests.
- 8281d73: Add CORS restriction and workflow validation to demo API. CORS now restricts to Vercel deployment URLs and localhost (dev). Workflows are validated server-side before execution using the core compiler.
- 3c9013c: Export Collapsible component from shadcn/ui. Add available tools list to workflow generation dialog in demo app, displayed in a collapsible panel above the prompt input.

### Patch Changes

- d6bcc3d: Skip full build step when running dev server by resolving workspace packages directly to source files.
- fa9e132: Add structured logging with pino to demo backend and PostHog analytics to frontend. Backend logs RPC requests, workflow execution, validation, and bot detection. Frontend tracks workflow runs, generation, imports/exports, and example loads with full workflow definitions.
- 70e2867: Pin demo dev server to port 3000 and docs to 5173, with docs link in demo conditionally pointing to localhost:5173 in development.
- 00d7989: Proxy PostHog events through /ingest via Vercel rewrites to bypass ad blockers. Use named parameter rewrite syntax to route analytics requests through the app's own domain instead of external PostHog hosts.
- 393630e: Rework README with documentation examples and improved structure. Align consumer-facing getting started guide with official docs, add features section, use cases, and clearer architecture overview.
- 67db2dd: Migrate demo app to Vite+Nitro full-stack architecture with oRPC. Updates graph layout and node components for new demo structure.
- Updated dependencies [8080391]
- Updated dependencies [d7bbc56]
- Updated dependencies [d6bcc3d]
- Updated dependencies [7611973]
- Updated dependencies [544f84f]
- Updated dependencies [f5f8c86]
- Updated dependencies [393630e]
  - @remoraflow/core@0.3.0

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

# @remoraflow/ui

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

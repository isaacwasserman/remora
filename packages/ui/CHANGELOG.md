# @remoraflow/ui

## 1.0.0

### Major Changes

- 2f62a14: Full rewrite of both packages. Every public module has been replaced; there is no incremental migration path from 0.x.

  ### Core architecture

  The entire `@remoraflow/core` source tree has been rewritten. The three top-level modules (`compiler/`, `executor/`, `generator/`) are replaced by six new ones:

  - **`execution/`** — workflow runner with pluggable execution engines, step executors, LLM middleware, approval policies, duration budgets, and user-intervention adapters.
  - **`validation/`** — modular validation pipeline (syntax, control-flow, structural limits, tool references, tool inputs, expression syntax, variable references, output schemas) replacing the monolithic compiler pass system.
  - **`generation/`** — workflow generation with output-schema contracts, stop conditions, and structured submission validation, replacing the old `generator/` module.
  - **`schemistry/`** — JMESPath output-type inference, JSON Schema subset diagnostics, structural summarization, Standard Schema helpers, and template extraction, consolidated from utilities formerly scattered across `compiler/utils/`.
  - **`audit/`** — static capability analysis of a workflow definition (tool-call provenance, input-space inference per tool).
  - **`step-registry`** — centralized registry of step types, their nested chains, output schemas, and metadata, replacing ad-hoc step-type handling spread across the codebase.

  The old entry point `lib.ts` is replaced by `index.ts` re-exporting all six modules.

  ### Schema and type system

  - Workflow definition schemas moved from `types.ts` to a dedicated `schema.ts` module. The schema is now the single source of truth for the workflow DSL; `types.ts` holds runtime configuration and tool types.
  - The `Tool` type is rewritten to accept `@ai-sdk/provider-utils` `Schema`, Zod v3/v4, and Standard Schema for both input and output schemas via a `FlexibleSchema` union. Output schemas on tools are now a first-class concept.
  - `RemoraflowSettings` (formerly `RemoraflowOptions`) is the unified configuration surface for duration policy, structural limits, and LLM defaults.

  ### New step types

  - **`while`** — general-purpose condition-driven loop with an optional accumulator, complementing `for-each` for cases where the iteration count is not known ahead of time.
  - **`request-intervention`** — replaces `ask-supervisor`. Supports both multiple-choice and free-response modes with adapter-level error handling.

  ### Execution engines

  Three execution engines replace the single `DurableExecutionAdapter` model:

  - **In-memory** (default) — steps run in-process with no recording; a re-invoked run starts over.
  - **Checkpointing** — records step results in a caller-supplied `CheckpointStore`; a re-invoked run skips completed steps but does not detect or recover from crashes.
  - **Durable** — delegates step execution and sleep to a `DurableExecutionAdapter` so a host with its own journal can suspend and resume runs. Adapters ship for AWS Lambda Durable Execution SDK, Inngest, and Temporal.

  The old SQLite adapter is removed.

  ### Execution runtime

  - Duration policy (`maxDurationSeconds`, `maxExecutionSeconds`, `maxWaitSeconds`, `maxSleepSeconds`, `maxStepExecutionSeconds`, `minPollIntervalSeconds`) is enforced at runtime, not just at validation time. All budgets survive a resume.
  - `structuralLimits.maxLoopIterations` is enforced at runtime. A `for-each` or `while` step exceeding the limit fails with `LOOP_ITERATION_LIMIT_EXCEEDED` before any iteration runs.
  - Durable step keys are derived from a step's path (e.g. `loop.2.callApi`) instead of a per-frame positional counter.
  - Delays are durable: `sleep` checkpoints its wake-up deadline and serves only the time still owed on resume.
  - `ExecutionState.status` gains `sleeping`, `awaiting-condition`, and `awaiting-input`.
  - LLM middleware pipeline for prompt construction, tool-constraint enforcement, and output parsing.
  - Approval-policy system for gating step execution.

  ### Validation

  The monolithic compiler is replaced by a modular validation pipeline with discrete passes:

  1. Syntax validation (arktype schema parse)
  2. Control-flow validation (reachability, cycle detection, nested-chain modelling)
  3. Structural-limit validation
  4. Tool-reference validation
  5. Expression-syntax validation (JMESPath and template parsing)
  6. Variable-reference validation (scope tracking with forward-reference detection)
  7. Output-schema validation (return-type inference across control-flow branches)
  8. Tool-input validation (type-checking tool inputs against declared schemas)
  9. Tool-definition validation (asserting execution functions and output schemas exist)

  Each pass can emit diagnostics and optionally correct the definition. A pass marked `failureMode: "block"` halts the pipeline on error.

  `compileWorkflow` is removed. Use `validateWorkflowDefinition` instead.

  ### Workflow generation

  - Callers can require an output schema and reject generated workflows that cannot satisfy the contract.
  - Nested control-flow return types are inferred precisely (switch-case branch unions, loop accumulator types).
  - Tool output schemas are provided to the generation model.
  - Undeclared workflow submission fields are rejected; strict structured submissions are enforced.
  - Detailed generation diagnostics are optionally observable.

  `generateWorkflow` and `createWorkflowGeneratorTool` are replaced by the new `generation/` module API.

  ### Peer dependencies

  - AI SDK peer dependency bumped from `ai@^6.0.0` / `@ai-sdk/provider-utils@^4.0.0` to `ai@^7.0.0` / `@ai-sdk/provider-utils@^5.0.11`.

  ### Core dependency changes

  - Removed: `@jmespath-community/jmespath`.
  - Added: `jmespath`, `ajv`, `@ark/json-schema`, `@standard-community/standard-json`, `@standard-schema/spec`, `zod@^4.4.3`, `dedent`.

  ### UI architecture

  `@remoraflow/ui` is rewritten around a data-driven step-UI registry that replaces per-step-type node components and param editors.

  - **Step-UI registry** (`step-ui/`) — each step type declares its label, icon, tone, fields, field order, and advanced/node-row configuration in a single `StepUi<T>` spec. The registry drives all rendering: node content, editor panels, palette entries, and field diagnostics. Adding a new step type to the UI is now a single registry entry rather than a new node component, param editor, and palette entry.
  - **Field system** (`editors/fields/`) — a typed `FieldSpec<V>` with `FieldKind` discriminator (`expression`, `template-text`, `identifier`, `step-ref`, `tool-ref`, `tool-ref-list`, `json-schema`, `schema-map`, `expression-map`, `case-list`, `boolean`, `constant`) replaces the old per-step-type param components.
  - **Generic node rendering** — per-step-type node components (`agent-loop-node`, `tool-call-node`, `for-each-node`, etc.) are replaced by a single `StepNode` driven by the registry's `nodeRows` and `headerRows` declarations.
  - **Syntax highlighting** — JMESPath and template-interpolation syntax highlighting via CodeMirror language support and inline `HighlightedExpression` components.
  - **Primitives** (`components/primitives/`) — shared layout, badge, code, diagnostics, field, and toggle-field primitives.
  - **Layout module** (`layout/`) — measurement, constants, and types extracted from the monolithic `graph-layout.ts`.
  - **Expression scope context** — `ExpressionScopeContext` provides in-scope variable paths to expression editors for autocomplete.
  - **Design system** — new `theme.css` with CSS custom properties; all shadcn primitive re-exports removed from the public API (consumers import them from their own shadcn installation).

  ### Breaking changes summary

  - Every import path from `@remoraflow/core` has changed. The entry point is now `index.ts`, not `lib.ts`. The `./adapters/aws-lambda` subpath export is removed.
  - `compileWorkflow` → `validateWorkflowDefinition`. The return type, diagnostics shape, and context arguments are different.
  - `executeWorkflow` / `executeWorkflowStream` → `runWorkflow` in `execution/`. Execution options, state shape, and streaming protocol are different.
  - `generateWorkflow` / `createWorkflowGeneratorTool` → new `generation/` module API with different options and return types.
  - `ask-supervisor` step type → `request-intervention`.
  - `DurableContext` → `ExecutionContext`, `DurableExecutor` → `ExecutionRun`, `DurableExecutionAdapter` (KV store) → `CheckpointStore`.
  - `DurableContext.waitFor` returns an async generator rather than a promise.
  - `now()` and `uuid()` are removed from the execution context.
  - `maxSleepSeconds` and `maxLLMPromptTokens` are removed from `ExecutionOptions`. Duration policy is configured via `RemoraflowSettings`.
  - Step ids may no longer begin with `__` (reserved for internal checkpoint keys).
  - AI SDK peer dependency: `ai@^6` → `ai@^7`, `@ai-sdk/provider-utils@^4` → `@ai-sdk/provider-utils@^5`.
  - `@remoraflow/ui` no longer re-exports shadcn components (`Button`, `Dialog`, `Select`, `Command`, etc.).
  - Per-step-type node components and param editors are removed. Custom rendering now goes through the step-UI registry.
  - Checkpoint keys for in-flight durable runs change format, so a run mid-flight across this upgrade will restart rather than resume.

### Minor Changes

- 3b663c3: Add expression autocomplete to the workflow editor. The JMESPath and template inputs in `StepEditorPanel` now surface in-scope paths via a Command-based suggestion popover, including `[*].field` projections for arrays of objects. Custom expressions can still be typed freely.

  `@remoraflow/core` exports two new utilities for building the scope tree: `getExpressionScope(workflow, graph, tools, stepId)` returns the root identifiers in scope at a step (workflow input, predecessor step outputs, enclosing for-each loop variables) along with their JSON Schemas, and `enumerateSuggestions(scope)` flattens that into a list of suggested paths. Types `ScopeEntry` and `ExpressionSuggestion` are also exported.

  `@remoraflow/ui`'s `StepEditorPanel` accepts a new `expressionScope` prop that is provided to descendant `ExpressionEditor`s via context. `WorkflowViewer` wires this up automatically using the latest compiled graph.

- 731af18: Show a tool's output schema in the workflow editor. When editing a `tool-call` step, the params panel now displays the tool's declared `outputSchema` as JSON Schema below the inputs, so users can see what data will be available to downstream steps after the tool runs.

### Patch Changes

- d540b2e: Fix @remoraflow/core resolving as uninstallable `workspace:*` for npm consumers by replacing the workspace protocol with a standard semver range managed by changesets.
- 2305db8: Fix declaration emit so dist/schema.d.ts and dist/types.d.ts are generated, and resolve all type errors across the monorepo
- d97e5e4: Fix package exports to point at built output in `dist/` instead of unpublished source files. Core's exports were a bare `./src/index.ts` (not in the tarball); UI had a `bun` condition with the same problem. Both now use only `import` and `types` conditions targeting `dist/`.
- 93ccb6d: Fix three shadcn component registry bugs that broke installs:

  - The registry import-rewriter kept relative paths (e.g. `../../components/ui/combobox`) for any file shipped by the registry, including `registry:ui` files. shadcn relocates `registry:ui` files to the consumer's ui alias, so those sibling-relative imports failed to resolve after install. Imports that resolve under `components/ui/` or `lib/` are now always rewritten to the `@/` alias.
  - Renamed the custom `combobox.tsx` ui primitive to `workflow-combobox.tsx` so it no longer overwrites the consumer's existing `ui/combobox.tsx` (shadcn's public registry has no combobox, so every consumer's combobox is a roll-your-own at that path). The exported `Combobox*` names from `@remoraflow/ui` are unchanged.
  - The `workflow-step-detail-panel` registry item duplicated six files already shipped by `workflow-viewer`, so installing both produced two copies of every shared file. The panel item now declares `workflow-viewer` as a `registryDependencies` entry and ships no files of its own.

- de7f094: Fix switch-case edges with empty `branchBodyStepId` targets in the graph layout. When a case's `branchBodyStepId` is `""` (e.g. from a newly-added case/default or after `clearChildRef`), the layout no longer emits an edge pointing at the non-existent node id `""`.
- 85b8673: Move syntax-highlighting CSS rules from styles.css to theme.css for better theme separation
- 2494402: Remove styles.css side-effect import and package.json style field now that all styles live in theme.css
- Updated dependencies [3b663c3]
- Updated dependencies [2305db8]
- Updated dependencies [d97e5e4]
- Updated dependencies [8c844da]
- Updated dependencies [1e8a513]
- Updated dependencies [367d847]
- Updated dependencies [be174fd]
- Updated dependencies [2f62a14]
- Updated dependencies [b91807e]
  - @remoraflow/core@1.0.0

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

# @remoraflow/core

## 0.8.0

### Minor Changes

- 499f437: Add prompt size limits to prevent context window overflow in LLM prompts and workflows.

  - Compile-time validation: emits `PROMPT_TEMPLATE_EXCEEDS_TOKEN_LIMIT` error when a prompt template exceeds the configured token limit
  - Execution-time truncation: proportionally truncates interpolated variable portions to fit within the total prompt token limit, with per-variable caps and truncation disclaimers
  - Configurable via `maxPromptTokens` (compiler + executor) and `maxPromptVariableTokens` (executor), defaulting to 100k and 5k tokens respectively
  - Uses the `tokenx` package for fast token estimation

- 8538813: Replace schema inference strategy with literal preservation, null-aware array merging, and heterogeneous array truncation

## 0.7.1

### Patch Changes

- 642e815: Change expression path diagnostics to errors instead of warnings

## 0.7.0

### Minor Changes

- ec262b9: Add compiler pass to validate property paths in JMESPath expressions against known output schemas. The new `JMESPATH_INVALID_PROPERTY_PATH` warning catches references to non-existent properties (e.g., `${step.data}` when the step output only has `result`), with hints listing available properties.

## 0.6.0

### Minor Changes

- eda0cc6: `generateWorkflow` now exposes a `giveUp` tool to the LLM so it can explicitly signal that a task cannot be expressed as a workflow over the provided tools. The tool requires both a categorical `code` (one of `missing-capability`, `ambiguous-task`, `not-workflow-shaped`, `infeasible`, `unsafe`, `other`) and a free-form `reason`.

  `GenerateWorkflowResult` is now a discriminated union on `success`:

  - **Success** (`success: true`): `workflow` is a non-null `WorkflowDefinition`; failure fields are `undefined`.
  - **Failure** (`success: false`): `workflow` is `null`; `failureCode: WorkflowFailureCode` and `failureMessage: string` are both populated. `failureCode` is either one of the agent-emitted give-up codes, or `retries-exhausted` when the retry budget runs out.

  TypeScript now correctly narrows the result after `if (result.success)`.

  New exports: `GenerateWorkflowSuccess`, `GenerateWorkflowFailure`, `WorkflowGiveUpCode`, `WorkflowFailureCode`, `WORKFLOW_GIVE_UP_CODES`.

## 0.5.0

## 0.4.0

### Minor Changes

- 7d2ed12: Make channel `publish()` and `close()` async, allowing persistent channel implementations to reliably await writes.

## 0.3.0

### Minor Changes

- 8080391: Add WorkflowExecutionStateChannel abstraction for flexible state publishing, `executeWorkflowStream` convenience helper, `useWorkflowExecution` React hook for managing execution lifecycle with pause/resume and replay capabilities, and `ReplaySlider` component. Includes full React Testing Library integration with 10 hook tests.
- d7bbc56: Add give-up tool to extract-data inline mode to allow LLM to fail gracefully when requested data is not available in the source, matching probe mode behavior. When the LLM calls give-up, the step throws an ExtractionError and fails the workflow.
- 544f84f: Add policy system for workflow approval flows and AWS Lambda durable execution adapter. Implements human-in-the-loop authorization with flexible policies, extensible approval workflows, and a DurableContext interface for environment-agnostic waiting primitives (step, sleep, waitForCondition, waitForCallback).

### Patch Changes

- d6bcc3d: Skip full build step when running dev server by resolving workspace packages directly to source files.
- 7611973: Fix extract-data give-up not stopping retries. When the LLM calls give-up during a retry attempt, the ExtractionError is now thrown immediately instead of being swallowed by the retry loop. Also reclassifies ExtractionError from `output-quality` to a new `extraction` error category.
- f5f8c86: Remove `sourcePolicyId` from `PolicyDecision` return type. The executor now derives it from the policy's `id` field during evaluation, ensuring it always matches the actual policy ID.
- 393630e: Rework README with documentation examples and improved structure. Align consumer-facing getting started guide with official docs, add features section, use cases, and clearer architecture overview.

## 0.2.0

### Minor Changes

- 4d432fc: Add output schema validation, tool input type validation, and output sanitization to prevent invalid workflow compilations. New utilities for step hashing and schema inference improvements.
- 46dda57: Restructure into Bun workspace monorepo with independent package directories. Rename packages to @remoraflow/core and @remoraflow/ui, both starting at 0.1.0 with synchronized versioning via changesets `fixed` configuration.

### Patch Changes

- be08d81: Publish interactive demo app to GitHub Pages alongside documentation. Add demo links to docs navbar, homepage, and README.
- f70ce65: Fix AI SDK tool() syntax in docs and simplify step-detail-panel component. Updated documentation examples from 'parameters' to 'inputSchema' to match AI SDK v6 API. Removed unused code from step-detail-panel.tsx.
- 8b4d516: Fix typedoc module names to generate correct API documentation paths. Added @module JSDoc tags to entry points so docs links resolve correctly.

## 0.3.0

### Minor Changes

- 7c2cc87: Add template expression type for string interpolation in expressions
- c791bac: Add custom instructions support to workflow generator

  Allows developers to inject additional instructions into the workflow generation system prompt, enabling fine-grained control over LLM-generated workflow behavior and preferences.

- ca4d80e: Restore Agent support for agent-loop steps. `executeWorkflow` now accepts an optional `agent` alongside `model`. When provided, agent-loop steps use the Agent's own tools and behaviors, then the bare model coerces the Agent's text output into structured output via `Output.object()`. A give-up tool is provided to the coercion step so it can signal when the Agent's output cannot be parsed into the expected schema.
- 061a4b1: Add auditable execution state tracking to the workflow executor and visualization support in the viewer.

  - New `ExecutionState` schema (arktype) tracks full execution history including step records, timing, outputs, errors, retries, and execution paths for branches/loops
  - New `onStateChange(state, delta)` callback on `executeWorkflow` emits structured state changes with idempotent deltas for incremental database updates
  - `ExecutionResult` now includes `executionState` field with the final execution state
  - Pure `applyDelta` reducer for reconstructing/verifying state from deltas
  - `WorkflowViewer` accepts optional `executionState` prop to visualize run progress on the DAG with status rings, icons, executed path highlighting, and execution details in the step detail panel

- 0a471bf: Add dark mode support to workflow viewer

  Adds a `dark` prop to WorkflowViewer component to enable dark theme styling. All components now read from a ViewerThemeProvider context. Dark mode adjusts backgrounds, text colors, borders, and badges for all nodes, edges, and the detail panel. Demo includes a toggle switch to test the feature.

- a5472a9: Add comprehensive guides for compiler options, execution options, and execution state.

  New documentation pages cover compiler options (`tools`, `limits`), `CompilerResult` with all 30+ diagnostic codes, the execution graph structure, constrained tool schemas, execution callbacks, executor limits, error handling and recovery strategies, durable execution contexts, execution state model, step records, execution paths, retry records, and state replay utilities.

- d1ceab6: Extract executor step handlers into individual files under `src/executor/steps/`, with shared types in `executor-types.ts` and shared helpers in `helpers.ts`
- 643bb56: Add configurable minimap sizing to WorkflowViewer: new props (showMinimap, minimapWidth, minimapHeight) enable downstream users to control visibility and dimensions, with automatic width capping at 25% of viewer width and aspect ratio preservation.
- d63cb35: Add probe-based data extraction for large datasets and integrate with agent-loop steps. Extract-data steps now automatically use JMESPath-based probing when data exceeds size threshold, with built-in schema summarization for LLM guidance.
- eeca7af: Update viewer colors to use shadcn design tokens. Replaces hardcoded gray colors with Tailwind aliases (bg-card, text-foreground, text-muted-foreground, border-border, etc.) for seamless downstream app design system compatibility. Resolves CSS variables for inline style colors with automatic fallbacks.
- 5d59eff: Add shadcn component registry for workflow viewer and step detail panel

  - Decouple `StepDetailPanel` from `WorkflowViewer` so they can be used independently
  - Export `StepDetailPanel` and `StepDetailPanelProps` from `@remoraflow/core/viewer`
  - Change `onStepSelect` callback to pass full step and diagnostics instead of just step ID
  - Add registry build script that generates shadcn-compatible JSON served via GitHub Pages
  - Components installable via `npx shadcn@latest add https://remoraflow.com/r/workflow-viewer.json`

- 15e55e4: Add optional `trace` field to `StepExecutionRecord` for capturing intermediate processing steps. Trace entries are a discriminated union with `log` (generic debug messages) and `agent-step` (raw AI SDK step data) types. LLM-based steps (agent-loop, llm-prompt, extract-data) now automatically populate trace entries with their intermediate AI SDK steps.
- f107949: Use AI SDK's Output.object() for structured output in LLM steps. All LLM step handlers (llm-prompt, extract-data, agent-loop) now use structured output to guarantee valid JSON from the model, eliminating parse errors. Simplifies the public API: `executeWorkflow` now accepts `model: LanguageModel` instead of `agent: Agent | LanguageModel`.
- 2cefcaa: Add agent-loop step type for autonomous agent execution

  This new step type allows delegating work to an autonomous agent with its own tool-calling loop. It supports both LanguageModel and pre-configured Agent instances. Marked "use sparingly" to preserve framework determinism.

### Patch Changes

- 8e897c0: Fix registry component imports to properly resolve types from package. Relative imports between registry files stay relative for portability; imports escaping the registry go to the main package (`@remoraflow/core`) or viewer subpath (`@remoraflow/core/viewer`) as appropriate.
- 5633e96: Use relative imports in registry components so they resolve correctly regardless of the user's shadcn components alias configuration.
- 6775420: Add vitepress-plugin-llms to documentation build for LLM-friendly documentation export
- 0b53376: Accept Agent with any type parameters in ExecutorOptions. The generic parameters of the Agent type are not relevant when accepting an agent, so the type now explicitly accepts `Agent<any, any, any>` to avoid unnecessarily constraining callers.
- c608ee1: Group registry components into subdirectories. Components now install with directory structure preserved (nodes/, edges/, panels/) instead of flattening to a single directory. Import paths updated from @/registry/default/ to @/components/.
- 7c053c9: Add documentation and component registry links to README, set npm homepage to docs, add llm.txt button to docs landing page, and enable markdown copy/download buttons
- 72d1701: Fix switch statement branch labels rendering behind edges in workflow viewer
- f2936c6: Enhance workflow viewer examples to showcase all DSL step types and features. Adds visual components for sleep, wait-for-condition, and agent-loop steps. Displays workflow input/output schemas in start/end nodes. Updated all three example workflows to demonstrate the complete DSL capabilities.
- 00dd719: Fix API reference docs returning 404 by configuring TypeDoc to generate `index.md` instead of `README.md` for directory entry pages
- b7f0b4c: Fix canary version publishing to use calculated next version instead of 0.0.0
- e0aa934: Fix broken llms.txt link on docs landing page (was pointing to `/llm.txt` instead of `/llms.txt`)
- c81af5f: Fix registry component display and styling issues: add missing StepParams cases for agent-loop, sleep, wait-for-condition, and end output; add distinct TypeBadge colors; fix scroll overflow with min-h-0; fix TypeScript strict mode errors; ensure panel is included in registry build.
- 8568c8d: Add comprehensive JSDoc/TSDoc documentation to all public API exports including compiler, executor, generator, types, and viewer
- 4c8af83: Fix foreach and switch group header nodes to show detail panel on click
- 83f99c3: Add hover effects to workflow viewer elements with subtle border and ring highlights
- 1d75559: Improve Biome linter strictness to catch downstream type issues by enabling noExplicitAny and noEvolvingTypes rules.
- f04282e: Update GitHub Actions to use latest versions (actions/checkout@v6 and actions/setup-node@v6)

## 0.2.1

### Patch Changes

- 1c36011: Fix CI publish step that silently skipped npm publish due to changesets/action splitting shell operators as arguments

## 0.2.0

### Minor Changes

- 9dd1e43: Add `sleep` and `wait-for-condition` workflow step types for time-based delays and polling-based condition checks during workflow execution

### Patch Changes

- 8623f9f: Fix canary publish workflow failing when a changeset has no package bump

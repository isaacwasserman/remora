---
"@remoraflow/core": major
"@remoraflow/ui": major
---

Full rewrite of both packages. Every public module has been replaced; there is no incremental migration path from 0.x.

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

# What is Remora?

Remora is a DSL for agents to write workflows for themselves. An agent receives a task, defines a workflow using Remora's JSON-based syntax, and gets it compiled and validated — producing an executable plan that is well-defined, repeatable, and auditable.

> Unlike unstructured instructions, a Remora workflow is a concrete artifact that can be inspected, versioned, and re-run deterministically.

The workflow definition is a JSON object, which means agents can produce it via a single tool call. The compiler returns structured diagnostics — errors and warnings with specific codes and locations — so the agent gets immediate feedback on whether its logic is sound and can fix issues before anything runs.

> An agent can author a workflow, compile it, read the diagnostics, and iterate — all within a single conversation turn.

The name comes from the remora fish, which attaches to sharks and other large animals. Remora workflows work alongside agents in a similar way: rather than constraining behavior through guardrails, the agent authors its own concrete, inspectable plan using familiar primitives — tool calls, loops, switch statements, and data extraction steps — connected by JMESPath expressions for data flow.

## Architecture

Remora has four main components:

### Compiler

A multi-pass compiler that takes a raw workflow definition and produces a validated execution graph. Passes include:

- **Graph construction** — builds the DAG, detects cycles and duplicate step IDs
- **Reference validation** — verifies all step references resolve
- **Limits validation** — checks literal sleep/wait values against configured limits
- **Output schema validation** — warns about JSON Schema keywords unsupported by LLM structured output APIs
- **Tool validation** — ensures tool call parameters match available tool schemas, including type checking
- **Control flow validation** — checks branching and looping logic
- **JMESPath validation** — parses and validates all expressions
- **For-each target validation** — confirms loop targets resolve to arrays
- **Constrained schema generation** — produces narrowed tool input schemas
- **Best practices** — applies non-destructive transformations (e.g., adding missing end steps)

Diagnostics are emitted as structured errors and warnings with specific codes, step locations, and field paths.

### Executor

A runtime engine that walks the compiled execution graph step by step. It handles:

- **Tool calls** with literal or expression-based arguments
- **LLM prompts** with template string interpolation from step outputs
- **Data extraction** via LLM-based extraction into structured formats
- **Switch-case** branching on step output values
- **For-each** loops over arrays with scoped iteration variables

Each step's output is stored in a scope that subsequent steps can reference via JMESPath expressions, providing structured data flow without arbitrary code.

The executor is compatible with the [Vercel AI SDK](https://ai-sdk.dev/) and supports any agent or language model implementing the AI SDK interfaces.

### Generator

An LLM-driven workflow generator that takes a natural language task description and produces a validated workflow definition. The generator uses a tool call loop — if compilation fails, diagnostics are fed back to the LLM for correction, up to a configurable number of retries.

### Viewer / Editor

A React-based workflow component built on [React Flow](https://reactflow.dev/) that renders compiled workflows as interactive DAGs. Click any node to see step details and diagnostics in a side panel.

Set `isEditing` to enable a full canvas editor: users can add steps via a right-click context menu or step palette, connect steps by dragging edges, delete nodes, and edit step parameters in a type-specific side panel. Pass `workflow={null}` to start with an empty canvas.

## Constrained Tool Schemas

When the compiler analyzes a workflow, it determines exactly which tool parameters are static (known at compile time) versus dynamic (resolved at runtime). This produces a narrowed input schema for each tool.

This matters for safety: a human supervisor can review the constrained schemas and approve a limited set of behaviors ahead of time. The compiler makes this distinction explicit, enabling workflows to run without human-in-the-loop supervision where appropriate.

> A workflow that only ever calls `sendEmail` with a specific template and a dynamic recipient is meaningfully different from one with unconstrained access to the email API.

## Status

Early prototype. The core compiler, executor, and viewer are functional, but the API is unstable and breaking changes should be expected.

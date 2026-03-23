# What is RemoraFlow?

RemoraFlow is a DSL for agents to write workflows for themselves. It allows an agent to produce a **well-defined, repeatable, and auditable** workflow from a task and toolset. 

These days, **most AI "workflows" are actually just long prompts that *describe logic but don't guarantee this logic***.

RemoraFlow is a language for defining workflows that guarantee an outcome through careful validation and deterministic behavior.

## Features

### Workflows by Agents, for Agents

The RemoraFlow syntax is JSON-based. This means flows can be easily generated via agent tool calls.

Flows consist of the same tool calls that your agent is used to, glued together deterministically with JMESPath expressions referencing each other.

As part of the `@remoraflow/core` package, we provide a reference `create-workflow` tool that you can immediately hand to your agents as well as a prompt to help you create your own workflow creation tool.

### Deterministic Execution (when you want it)

While many flows can be constructed entirely from sequences of [tool calls](./workflow-definitions.md#tool-call) and [branching logic](./workflow-definitions.md#switch-case), the most useful flows require the intelligence of an LLM. RemoraFlow provides LLM-based steps that make strong guarantees about their behavior through validation, intelligent retries, and access control (see [LLM Prompt Step](./workflow-definitions.md#llm-prompt), [Extract Data Step](./workflow-definitions.md#extract-data), [Agent Loop Step](./workflow-definitions.md#agent-loop)).

### Ahead-of-Time Validation

Through careful ahead-of-time validation, the agent (or user) authoring a flow is provided deterministic diagnostics and feedback on whether its workflow works. The compiler provides traceable diagnostics that the agent can fix before the workflow ever runs.

### Durable Execution

RemoraFlow is compatible with leading durable execution environments, allowing workflows to sleep or block on conditions for long-periods without consuming serverless resources.

## Constrained Tool Schemas

When the compiler analyzes a workflow, it determines exactly which tool parameters are static (known at compile time) versus dynamic (resolved at runtime). This produces a narrowed input schema for each tool.

This matters for safety: a human supervisor can review the constrained schemas and approve a limited set of behaviors ahead of time. The compiler makes this distinction explicit, enabling workflows to run without human-in-the-loop supervision where appropriate.

> A workflow that only ever calls `sendEmail` with a specific template and a dynamic recipient is meaningfully different from one with unconstrained access to the email API.

## Use Cases

### Unsupervised Jobs

Agents can construct repeatable workflows to be run as cron jobs, webhook handlers, etc. With RemoraFlow, the execution is predictable and can be easily audited.

### Agent Plans

Workflows can be constructed interactively as an alternative to agent "plans".

Traditionally, agents like Claude Code present text-based plans that outline how they're going to complete a task, including subtasks, subtask dependency, logic, and subagent use.

However, text-based plans don't provide any guarantees of the agent's behavior; an agent can present a plan and decide to do something completely different during execution.

Using RemoraFlow, agents can construct a workflows instead of a text-based plan, and the resultant workflow can be run with behavioral guarantees and an audit trail.

## Architecture

RemoraFlow has four main components:

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

A React-based workflow component built on [React Flow](https://reactflow.dev/) that renders compiled workflows as interactive DAGs. Click any node to see step details and diagnostics in a side panel. This is available in the `@remoraflow/ui` package or via the [shadcn compatible registry](./component-registry.md).

## Status

Early prototype. The core compiler, executor, and viewer are functional, but the API is unstable and breaking changes should be expected.

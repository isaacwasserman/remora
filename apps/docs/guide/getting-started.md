# Getting Started

In the next five minutes, you'll generate, compile, and execute your first RemoraFlow workflow — a validated, deterministic pipeline with LLM intelligence scoped to exactly the steps that need it.

## Install

:::tabs
== bun
```bash
bun add @remoraflow/core
```
== npm
```bash
npm install @remoraflow/core
```
== pnpm
```bash
pnpm add @remoraflow/core
```
== yarn
```bash
yarn add @remoraflow/core
```
:::

RemoraFlow uses the [AI SDK](https://ai-sdk.dev/) for LLM calls and tool definitions. Install it along with your provider of choice:

:::tabs
== bun
```bash
bun add ai @ai-sdk/anthropic  # or @ai-sdk/openai, etc.
```
== npm
```bash
npm install ai @ai-sdk/anthropic
```
== pnpm
```bash
pnpm add ai @ai-sdk/anthropic
```
== yarn
```bash
yarn add ai @ai-sdk/anthropic
```
:::

## Define Your Tools

Tools are the primary building blocks of workflows. Before you can generate a workflow, you need to give the agent something to work with. Here's a minimal toolset using the [AI SDK `tool` helper](https://ai-sdk.dev/):

```ts
import { tool } from "ai";
import { z } from "zod";

const tools = {
  "get-open-tickets": tool({
    description: "Fetch all open support tickets",
    parameters: z.object({}),
    execute: async () => {
      return {
        tickets: [
          { id: "T-1", subject: "Login broken", body: "Can't log in since the update." },
          { id: "T-2", subject: "Billing question", body: "Why was I charged twice?" },
          { id: "T-3", subject: "Site down", body: "Getting 503 errors on all pages." },
        ],
      };
    },
  }),
  "page-oncall": tool({
    description: "Page the on-call engineer",
    parameters: z.object({
      ticketId: z.string(),
      severity: z.string(),
    }),
    execute: async ({ ticketId, severity }) => {
      console.log(`Paging on-call for ${ticketId} (${severity})`);
      return { paged: true };
    },
  }),
};
```

Nothing special — these are standard AI SDK tools. If you've used tool calling with any LLM provider, you already know how this works.

## Generate a Workflow

Give the agent a task description and your tools. It'll handle the rest:

```ts
import { generateWorkflow } from "@remoraflow/core";
import { anthropic } from "@ai-sdk/anthropic";

const result = await generateWorkflow({
  model: anthropic("claude-sonnet-4-20250514"),
  tools,
  task: "Fetch all open support tickets, classify each by severity, and page the on-call engineer for critical ones",
});

if (result.workflow) {
  console.log(`Generated a valid workflow in ${result.attempts} attempt(s)`);
  // result.workflow is already compiled and ready to execute
} else {
  console.error("Generation failed:", result.diagnostics);
}
```

Under the hood, `generateWorkflow` gives the LLM your tool schemas and a structured prompt describing the [workflow definition language](/guide/workflow-definitions). The agent produces a workflow, the [compiler](/guide/compilation) validates it — checking references, types, reachability, expression syntax — and if anything's wrong, the diagnostics go back to the agent for correction. This loop runs until the workflow compiles cleanly or the retry limit is reached.

The result is a compiled, validated workflow graph — ready to execute, no manual review required (unless you [want it](/guide/policies)).

::: tip Other ways to generate workflows
`generateWorkflow` is the quickest path, but it's not the only one. You can use [`createWorkflowGeneratorTool`](/api/lib/functions/createWorkflowGeneratorTool) to create an AI SDK tool that generates workflows — meaning agents (and their workflows) can generate other workflows. You can also build your own generation pipeline using the [compiler](/guide/compilation) directly, or skip generation entirely and produce the [definition JSON](/guide/workflow-definitions) by any means you like. Anything that outputs a valid workflow definition can be compiled and executed.
:::

## Run It

```ts
import { executeWorkflow } from "@remoraflow/core";

const execution = await executeWorkflow(result.workflow, {
  tools,
  model: anthropic("claude-sonnet-4-20250514"),
  onStateChange: (state, delta) => {
    if (delta.type === "step-started") {
      console.log(`Starting: ${delta.stepId}`);
    }
    if (delta.type === "step-completed") {
      console.log(`Completed: ${delta.stepId} (${delta.durationMs}ms)`);
    }
    if (delta.type === "step-failed") {
      console.error(`Failed: ${delta.stepId} — ${delta.error.message}`);
    }
  },
});

if (execution.success) {
  console.log("Workflow output:", execution.output);
  console.log("Step outputs:", execution.stepOutputs);
} else {
  console.error(`Failed at step "${execution.error?.stepId}":`, execution.error?.message);
}
```

Every state transition is observable in real time through the `onStateChange` callback — starts, completions, failures, retries, even [approval decisions](/guide/policies). The full [execution state](/guide/execution-state) is serializable, so you can persist it, stream it to a UI, or feed it into your own observability stack.

## Visualize It

Want to see what the agent built? The `@remoraflow/ui` package renders workflows as interactive DAGs:

```bash
bun add @remoraflow/ui @xyflow/react
```

Then import the package CSS (includes Tailwind utilities and sensible default theme variables):

```ts
import "@remoraflow/ui/styles.css";
```

```tsx
import { WorkflowViewer, StepDetailPanel } from "@remoraflow/ui";
import type { WorkflowStep, Diagnostic } from "@remoraflow/core";
import { useState } from "react";

function App() {
  const [step, setStep] = useState<WorkflowStep | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <div style={{ flex: 1 }}>
        <WorkflowViewer
          workflow={result.workflow}
          executionState={execution.executionState}
          hideDetailPanel
          onStepSelect={(s, d) => { setStep(s); setDiagnostics(d); }}
        />
      </div>
      {step && (
        <StepDetailPanel
          step={step}
          diagnostics={diagnostics}
          onClose={() => setStep(null)}
        />
      )}
    </div>
  );
}
```

The viewer highlights step status in real time during execution and lets you click into any node to inspect its inputs, outputs, and diagnostics. It also supports a full visual editor — see the [Component Registry](/guide/component-registry) for installation and the full props reference.

## What's Next

You've gone from a task description to a compiled, validated, executed workflow — with real-time observability and a visual DAG — in about thirty lines of code. Here's where to go deeper:

```tsx
import {
  WorkflowViewer,
  StepEditorPanel,
  StepDetailPanel,
} from "@remoraflow/ui";
import type { WorkflowDefinition, WorkflowStep, Diagnostic } from "@remoraflow/core";
import { useState } from "react";

function WorkflowEditor({ tools }) {
  const [workflow, setWorkflow] = useState<WorkflowDefinition | null>(null);
  const [selectedStep, setSelectedStep] = useState<WorkflowStep | null>(null);
  const [stepDiagnostics, setStepDiagnostics] = useState<Diagnostic[]>([]);
  const [isEditing, setIsEditing] = useState(true);

  const availableToolNames = Object.keys(tools ?? {});

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <div style={{ flex: 1 }}>
        <WorkflowViewer
          workflow={workflow}
          isEditing={isEditing}
          onWorkflowChange={setWorkflow}
          tools={tools}
          hideDetailPanel
          onStepSelect={(s, d) => { setSelectedStep(s); setStepDiagnostics(d); }}
        />
      </div>
      {selectedStep && isEditing && (
        <StepEditorPanel
          step={selectedStep}
          availableToolNames={availableToolNames}
          allStepIds={workflow?.steps.map((s) => s.id) ?? []}
          diagnostics={stepDiagnostics}
          onChange={(updates) => {
            // updates is a partial step object — merge into the workflow
          }}
          onClose={() => setSelectedStep(null)}
        />
      )}
      {selectedStep && !isEditing && (
        <StepDetailPanel
          step={selectedStep}
          diagnostics={stepDiagnostics}
          onClose={() => setSelectedStep(null)}
        />
      )}
    </div>
  );
}
```

Pass `workflow={null}` to start with an empty canvas. The `onWorkflowChange` callback is called with the updated `WorkflowDefinition` whenever a step is added, removed, or modified.

### `WorkflowViewer` editing props

| Prop | Type | Default | Description |
|---|---|---|---|
| `isEditing` | `boolean` | `false` | Enables canvas editing mode. |
| `onWorkflowChange` | `(w: WorkflowDefinition) => void` | — | Called on every workflow mutation. |
| `tools` | `ToolSet` | — | Provides tool name autocomplete in the step editor. |
| `hideDetailPanel` | `boolean` | `false` | Hides the built-in detail/editor panel. Use when rendering `StepDetailPanel` or `StepEditorPanel` externally. |

### `StepEditorPanel` props

| Prop | Type | Required | Description |
|---|---|---|---|
| `step` | `WorkflowStep` | Yes | The step to edit. |
| `availableToolNames` | `string[]` | Yes | Tool names for autocomplete in `tool-call` steps. |
| `allStepIds` | `string[]` | Yes | All step IDs for reference validation in editors. |
| `toolSchemas` | `ToolDefinitionMap` | No | Tool schemas for parameter hints. |
| `diagnostics` | `Diagnostic[]` | No | Diagnostics to highlight on specific fields. |
| `workflowInputSchema` | `object` | No | Workflow-level input schema (for `start` step editor). |
| `workflowOutputSchema` | `object` | No | Workflow-level output schema (for `end` step editor). |
| `onChange` | `(updates: Record<string, unknown>) => void` | Yes | Called with a partial step object on any field change. |
| `onWorkflowMetaChange` | `(updates: Record<string, unknown>) => void` | No | Called when the user edits the workflow's `inputSchema` or `outputSchema` (from start/end step editors). |
| `onClose` | `() => void` | Yes | Called when the user closes the panel. |

### Install via shadcn

The viewer components are also available as a [shadcn registry](/guide/component-registry). This copies the source directly into your project, letting you customize the components:

:::tabs
== npx
```bash
npx shadcn@latest add https://remoraflow.com/r/workflow-viewer.json
npx shadcn@latest add https://remoraflow.com/r/workflow-step-detail-panel.json
```
== bunx
```bash
bunx shadcn@latest add https://remoraflow.com/r/workflow-viewer.json
bunx shadcn@latest add https://remoraflow.com/r/workflow-step-detail-panel.json
```
== pnpx
```bash
pnpx shadcn@latest add https://remoraflow.com/r/workflow-viewer.json
pnpx shadcn@latest add https://remoraflow.com/r/workflow-step-detail-panel.json
```
:::

- **[Workflow Definitions](/guide/workflow-definitions)** — every step type, expression syntax, and data flow pattern
- **[Compilation](/guide/compilation)** — compiler passes, diagnostics, and constrained tool schemas
- **[Execution](/guide/execution)** — retry behavior, error handling, durable execution, and resource limits
- **[Policies & Approvals](/guide/policies)** — gate tool calls behind authorization rules and human approval workflows
- **[Execution State](/guide/execution-state)** — the full state model, deltas, and real-time observability
- **[Streaming & Channels](/guide/streaming)** — stream execution state across process boundaries, multiple subscribers, debouncing, and custom transports
- **[Component Registry](/guide/component-registry)** — install viewer components via shadcn for full customization

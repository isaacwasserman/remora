<p align="center">
  <img src="apps/docs/public/remoraflow-logo.svg" alt="Remoraflow Logo" width="400" />
</p>

<p align="center">Workflows by agents, for agents.</p>

**[Documentation](https://remoraflow.com/)** · **[Demo](https://remoraflow.com/demo/)** · **[GitHub](https://github.com/isaacwasserman/remora)**

RemoraFlow is a DSL for agents to write workflows for themselves. An agent receives a task, defines a workflow using RemoraFlow's JSON-based syntax, and gets it compiled and validated — producing an executable plan that is **well-defined, repeatable, and auditable**.

Most AI "workflows" are just long prompts that *describe logic but don't guarantee it*. RemoraFlow is a language for defining workflows that guarantee an outcome through careful validation and deterministic behavior.

## Features

- **JSON-based syntax** — Flows can be generated via agent tool calls. We provide a reference `create-workflow` tool you can hand directly to your agents.
- **Deterministic execution** — Tool calls and branching logic glued together with JMESPath expressions. LLM-based steps provide intelligence with strong guarantees through validation, retries, and access control.
- **Ahead-of-time validation** — A multi-pass compiler provides traceable diagnostics that agents can fix before the workflow ever runs.
- **Constrained tool schemas** — The compiler distinguishes static vs. dynamic tool parameters, producing narrowed input schemas. A human supervisor can review and approve a limited set of behaviors ahead of time.
- **Durable execution** — Compatible with leading durable execution environments, allowing workflows to sleep or block without consuming serverless resources.

## Use Cases

- **Unsupervised jobs** — Agents construct repeatable workflows for cron jobs, webhook handlers, etc. with predictable execution and audit trails.
- **Agent plans** — Workflows replace text-based plans with behavioral guarantees. Unlike a text plan, a compiled workflow can't deviate from its defined logic during execution.

## Getting Started

### Installation

```bash
bun add @remoraflow/core
```

Peer dependencies (install as needed):

```bash
# For LLM steps (llm-prompt, extract-data) and workflow generation
bun add ai @ai-sdk/anthropic  # or @ai-sdk/openai, etc.

# For the workflow viewer/editor component
bun add @remoraflow/ui react react-dom @xyflow/react
```

### Compile a Workflow

```ts
import { compileWorkflow } from "@remoraflow/core";

const workflow = {
  initialStepId: "get_tickets",
  steps: [
    {
      id: "get_tickets",
      name: "Get tickets",
      description: "Fetch all open support tickets",
      type: "tool-call",
      params: {
        toolName: "get-open-tickets",
        toolInput: {},
      },
      nextStepId: "end_step",
    },
    {
      id: "end_step",
      name: "Done",
      description: "End the workflow",
      type: "end",
    },
  ],
};

const result = await compileWorkflow(workflow, { tools: myTools });

const errors = result.diagnostics.filter((d) => d.severity === "error");
if (errors.length > 0) {
  console.error("Compilation errors:", errors);
} else {
  console.log("Workflow is valid!");
}
```

### Execute a Workflow

```ts
import { executeWorkflow } from "@remoraflow/core";

const result = await executeWorkflow(workflow, {
  tools: myTools,
  model: anthropic("claude-sonnet-4-20250514"),
  inputs: { userId: "123" },
  onStepStart: (stepId) => console.log(`Starting: ${stepId}`),
  onStepComplete: (stepId, output) =>
    console.log(`Completed: ${stepId}`, output),
});

if (result.success) {
  console.log("Workflow output:", result.output);
} else {
  console.error("Execution failed:", result.error);
}
```

### Generate a Workflow

```ts
import { generateWorkflow } from "@remoraflow/core";
import { anthropic } from "@ai-sdk/anthropic";

const result = await generateWorkflow({
  model: anthropic("claude-sonnet-4-20250514"),
  tools: myTools,
  task: "Fetch all open support tickets, classify each by severity, and page the on-call engineer for critical ones",
});

if (result.workflow) {
  console.log(`Generated in ${result.attempts} attempt(s)`);
} else {
  console.error("Generation failed:", result.diagnostics);
}
```

### Visualize a Workflow

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
          workflow={myWorkflow}
          diagnostics={compileResult.diagnostics}
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

The viewer components are also available via the [shadcn registry](https://remoraflow.com/guide/component-registry) for full customization:

```bash
bunx shadcn@latest add https://remoraflow.com/r/workflow-viewer.json
bunx shadcn@latest add https://remoraflow.com/r/workflow-step-detail-panel.json
```

## Architecture

RemoraFlow has four main components:

- **Compiler** — Multi-pass validation producing a DAG with structured diagnostics (graph construction, reference validation, JMESPath validation, tool validation, constrained schema generation, and more).
- **Executor** — Runtime engine handling tool calls, LLM prompts, data extraction, switch-case branching, and for-each loops. Compatible with the [Vercel AI SDK](https://ai-sdk.dev/).
- **Generator** — LLM-driven workflow creator from natural language, with automatic retry on compilation failure.
- **Viewer / Editor** — React-based interactive DAG visualization built on [React Flow](https://reactflow.dev/). Supports both read-only viewing and full canvas editing.

## Status

Early prototype. The core compiler, executor, and viewer are functional, but the API is unstable and breaking changes should be expected.

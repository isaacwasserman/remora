# Getting Started

## Installation

:::tabs
== bun
```bash
bun add @isaacwasserman/remora
```
== npm
```bash
npm install @isaacwasserman/remora
```
== pnpm
```bash
pnpm add @isaacwasserman/remora
```
== yarn
```bash
yarn add @isaacwasserman/remora
```
:::

Peer dependencies (install as needed):

:::tabs
== bun
```bash
# For LLM steps (llm-prompt, extract-data) and workflow generation
bun add ai @ai-sdk/anthropic  # or @ai-sdk/openai, etc.

# For the workflow viewer component
bun add react react-dom @xyflow/react
```
== npm
```bash
# For LLM steps (llm-prompt, extract-data) and workflow generation
npm install ai @ai-sdk/anthropic  # or @ai-sdk/openai, etc.

# For the workflow viewer component
npm install react react-dom @xyflow/react
```
== pnpm
```bash
# For LLM steps (llm-prompt, extract-data) and workflow generation
pnpm add ai @ai-sdk/anthropic  # or @ai-sdk/openai, etc.

# For the workflow viewer component
pnpm add react react-dom @xyflow/react
```
== yarn
```bash
# For LLM steps (llm-prompt, extract-data) and workflow generation
yarn add ai @ai-sdk/anthropic  # or @ai-sdk/openai, etc.

# For the workflow viewer component
yarn add react react-dom @xyflow/react
```
:::

## Compile a Workflow

Use [`compileWorkflow`](/api/lib/functions/compileWorkflow) to validate a workflow definition and produce an execution graph:

```ts
import { compileWorkflow } from "@isaacwasserman/remora";

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

// Check for errors
const errors = result.diagnostics.filter((d) => d.severity === "error");
if (errors.length > 0) {
  console.error("Compilation errors:", errors);
} else {
  console.log("Workflow is valid!");
}
```

## Execute a Workflow

Use [`executeWorkflow`](/api/lib/functions/executeWorkflow) to run a compiled workflow:

```ts
import { executeWorkflow } from "@isaacwasserman/remora";

const result = await executeWorkflow(workflow, {
  tools: myTools,
  agent: myAgent, // Required if the workflow has llm-prompt or extract-data steps
  inputs: { userId: "123" }, // Passed to the start step
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

## Generate a Workflow

Use [`generateWorkflow`](/api/lib/functions/generateWorkflow) to have an LLM create a workflow from a natural language description:

```ts
import { generateWorkflow } from "@isaacwasserman/remora";
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

## Visualize a Workflow

Use the [`WorkflowViewer`](/api/viewer/functions/WorkflowViewer) and [`StepDetailPanel`](/api/viewer/functions/StepDetailPanel) React components to render workflows as interactive DAGs:

```tsx
import { WorkflowViewer, StepDetailPanel } from "@isaacwasserman/remora/viewer";
import type { WorkflowStep, Diagnostic } from "@isaacwasserman/remora";
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

Requires `@xyflow/react` and `@xyflow/react/dist/style.css` imported in your app.

### Install via shadcn

The viewer components are also available as a [shadcn registry](/guide/component-registry). This copies the source directly into your project, letting you customize the components:

:::tabs
== npx
```bash
npx shadcn@latest add https://isaacwasserman.github.io/remora/r/workflow-viewer.json
npx shadcn@latest add https://isaacwasserman.github.io/remora/r/workflow-step-detail-panel.json
```
== bunx
```bash
bunx shadcn@latest add https://isaacwasserman.github.io/remora/r/workflow-viewer.json
bunx shadcn@latest add https://isaacwasserman.github.io/remora/r/workflow-step-detail-panel.json
```
== pnpx
```bash
pnpx shadcn@latest add https://isaacwasserman.github.io/remora/r/workflow-viewer.json
pnpx shadcn@latest add https://isaacwasserman.github.io/remora/r/workflow-step-detail-panel.json
```
:::

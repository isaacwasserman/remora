# Getting Started

## Installation

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
import { executeWorkflow } from "@remoraflow/core";

const result = await executeWorkflow(workflow, {
  tools: myTools,
  model: anthropic("claude-sonnet-4-20250514"), // Required if the workflow has llm-prompt, extract-data, or agent-loop steps
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

## Visualize a Workflow

Use the [`WorkflowViewer`](/api/viewer/functions/WorkflowViewer) and [`StepDetailPanel`](/api/viewer/functions/StepDetailPanel) React components to render workflows as interactive DAGs:

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

Requires `@xyflow/react` and `@xyflow/react/dist/style.css` imported in your app.

## Edit a Workflow Visually

Set `isEditing` on `WorkflowViewer` to enable a full canvas editor. In editing mode, users can add steps via right-click context menu or a step palette, connect steps by dragging edges, and delete nodes. Use [`StepEditorPanel`](/api/viewer/functions/StepEditorPanel) as the side panel to let users edit step parameters:

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

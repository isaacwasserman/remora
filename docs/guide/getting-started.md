# Getting Started

## Installation

```bash
bun add remora
```

Peer dependencies (install as needed):

```bash
# For LLM steps (llm-prompt, extract-data) and workflow generation
bun add ai @ai-sdk/anthropic  # or @ai-sdk/openai, etc.

# For the workflow viewer component
bun add react react-dom @xyflow/react
```

## Compile a Workflow

Use [`compileWorkflow`](/api/lib/functions/compileWorkflow) to validate a workflow definition and produce an execution graph:

```ts
import { compileWorkflow } from "remora";

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
import { executeWorkflow } from "remora";

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
import { generateWorkflow } from "remora";
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

Use the [`WorkflowViewer`](/api/viewer/functions/WorkflowViewer) React component to render workflows as interactive DAGs:

```tsx
import { WorkflowViewer } from "remora/viewer";

function App() {
  return (
    <WorkflowViewer
      workflow={myWorkflow}
      diagnostics={compileResult.diagnostics}
      onStepSelect={(id) => console.log("Selected:", id)}
    />
  );
}
```

Requires `@xyflow/react` as a peer dependency.

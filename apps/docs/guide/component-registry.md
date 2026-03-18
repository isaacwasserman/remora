# Component Registry

Remora's viewer components are available as a [shadcn-compatible registry](https://ui.shadcn.com/docs/registry), hosted on GitHub Pages. This lets you install the component source directly into your project so you can customize it freely.

## Available Components

### Workflow Viewer

Interactive DAG visualization (and editor) for workflow definitions, built on [React Flow](https://reactflow.dev/).

:::tabs
== npx
```bash
npx shadcn@latest add https://isaacwasserman.github.io/remora/r/workflow-viewer.json
```
== bunx
```bash
bunx shadcn@latest add https://isaacwasserman.github.io/remora/r/workflow-viewer.json
```
== pnpx
```bash
pnpx shadcn@latest add https://isaacwasserman.github.io/remora/r/workflow-viewer.json
```
:::

**Dependencies installed:** `@remoraflow/core`, `@xyflow/react`, `@dagrejs/dagre`

### Workflow Step Detail Panel

Read-only panel that displays step parameters, resolved inputs, execution history, and diagnostics for a selected workflow step.

:::tabs
== npx
```bash
npx shadcn@latest add https://isaacwasserman.github.io/remora/r/workflow-step-detail-panel.json
```
== bunx
```bash
bunx shadcn@latest add https://isaacwasserman.github.io/remora/r/workflow-step-detail-panel.json
```
== pnpx
```bash
pnpx shadcn@latest add https://isaacwasserman.github.io/remora/r/workflow-step-detail-panel.json
```
:::

**Dependencies installed:** `@remoraflow/core`

### Workflow Step Editor Panel

Editable side panel with type-specific parameter editors for every step type. Pair with `WorkflowViewer isEditing` for a full workflow builder UI.

:::tabs
== npx
```bash
npx shadcn@latest add https://isaacwasserman.github.io/remora/r/workflow-step-editor-panel.json
```
== bunx
```bash
bunx shadcn@latest add https://isaacwasserman.github.io/remora/r/workflow-step-editor-panel.json
```
== pnpx
```bash
pnpx shadcn@latest add https://isaacwasserman.github.io/remora/r/workflow-step-editor-panel.json
```
:::

**Dependencies installed:** `@remoraflow/core`, CodeMirror editors

## Prerequisites

- A project with [shadcn/ui](https://ui.shadcn.com) configured (for the `@/` path alias and Tailwind CSS)
- Import `@xyflow/react/dist/style.css` somewhere in your app (required for the viewer)

## Dark Mode

Both components follow the shadcn convention for dark mode — they use Tailwind's `dark:` variant classes and detect the `dark` class on `<html>`. No props needed; just toggle `class="dark"` on your document element as you normally would with shadcn/ui.

## Usage

The components are independent — use any combination:

### Viewer + Detail Panel (read-only)

```tsx
import { WorkflowViewer } from "@/components/workflow-viewer/workflow-viewer";
import { StepDetailPanel } from "@/components/workflow-step-detail-panel/panels/step-detail-panel";
import type { WorkflowStep, Diagnostic } from "@remoraflow/core";
import { useState } from "react";
import "@xyflow/react/dist/style.css";

export function WorkflowPage({ workflow, diagnostics }) {
  const [step, setStep] = useState<WorkflowStep | null>(null);
  const [stepDiagnostics, setStepDiagnostics] = useState<Diagnostic[]>([]);

  return (
    <div className="flex h-screen">
      <div className="flex-1">
        <WorkflowViewer
          workflow={workflow}
          diagnostics={diagnostics}
          onStepSelect={(s, d) => {
            setStep(s);
            setStepDiagnostics(d);
          }}
        />
      </div>
      {step && (
        <StepDetailPanel
          step={step}
          diagnostics={stepDiagnostics}
          onClose={() => setStep(null)}
        />
      )}
    </div>
  );
}
```

### Viewer + Editor Panel (editable)

```tsx
import { WorkflowViewer } from "@/components/workflow-viewer/workflow-viewer";
import { StepEditorPanel } from "@/components/workflow-step-editor-panel/panels/step-editor-panel";
import type { WorkflowDefinition, WorkflowStep, Diagnostic } from "@remoraflow/core";
import { useState } from "react";
import "@xyflow/react/dist/style.css";

export function WorkflowBuilder({ tools }) {
  const [workflow, setWorkflow] = useState<WorkflowDefinition | null>(null);
  const [step, setStep] = useState<WorkflowStep | null>(null);
  const [stepDiagnostics, setStepDiagnostics] = useState<Diagnostic[]>([]);

  const availableToolNames = Object.keys(tools ?? {});

  return (
    <div className="flex h-screen">
      <div className="flex-1">
        <WorkflowViewer
          workflow={workflow}
          isEditing
          onWorkflowChange={setWorkflow}
          tools={tools}
          onStepSelect={(s, d) => {
            setStep(s);
            setStepDiagnostics(d);
          }}
        />
      </div>
      {step && (
        <StepEditorPanel
          step={step}
          availableToolNames={availableToolNames}
          allStepIds={workflow?.steps.map((s) => s.id) ?? []}
          diagnostics={stepDiagnostics}
          onChange={(updates) => {
            // merge updates into the workflow
          }}
          onClose={() => setStep(null)}
        />
      )}
    </div>
  );
}
```

## npm Package Alternative

If you don't need to customize the components, you can use them directly from the npm package instead:

:::tabs
== bun
```bash
bun add @remoraflow/core @remoraflow/ui react react-dom @xyflow/react
```
== npm
```bash
npm install @remoraflow/core @remoraflow/ui react react-dom @xyflow/react
```
== pnpm
```bash
pnpm add @remoraflow/core @remoraflow/ui react react-dom @xyflow/react
```
== yarn
```bash
yarn add @remoraflow/core @remoraflow/ui react react-dom @xyflow/react
```
:::

```tsx
import { WorkflowViewer, StepDetailPanel, StepEditorPanel } from "@remoraflow/ui";
```

See the [Getting Started](/guide/getting-started#visualize-a-workflow) guide for details.

## Registry Endpoint

The registry index is available at:

```
https://isaacwasserman.github.io/remora/r/registry.json
```

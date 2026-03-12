# Component Registry

Remora's viewer components are available as a [shadcn-compatible registry](https://ui.shadcn.com/docs/registry), hosted on GitHub Pages. This lets you install the component source directly into your project so you can customize it freely.

## Available Components

### Workflow Viewer

Interactive DAG visualization for workflow definitions, built on [React Flow](https://reactflow.dev/).

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

**Dependencies installed:** `@isaacwasserman/remora`, `@xyflow/react`, `@dagrejs/dagre`

### Workflow Step Detail Panel

Detail panel that displays step parameters and diagnostics for a selected workflow step.

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

**Dependencies installed:** `@isaacwasserman/remora`

## Prerequisites

- A project with [shadcn/ui](https://ui.shadcn.com) configured (for the `@/` path alias and Tailwind CSS)
- Import `@xyflow/react/dist/style.css` somewhere in your app (required for the viewer)

## Dark Mode

Both components follow the shadcn convention for dark mode — they use Tailwind's `dark:` variant classes and detect the `dark` class on `<html>`. No props needed; just toggle `class="dark"` on your document element as you normally would with shadcn/ui.

## Usage

The two components are independent — you can use either one alone or compose them together:

```tsx
import { WorkflowViewer } from "@/components/workflow-viewer/workflow-viewer";
import { StepDetailPanel } from "@/components/workflow-step-detail-panel/panels/step-detail-panel";
import type { WorkflowStep, Diagnostic } from "@isaacwasserman/remora";
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

## npm Package Alternative

If you don't need to customize the components, you can use them directly from the npm package instead:

:::tabs
== bun
```bash
bun add @isaacwasserman/remora react react-dom @xyflow/react
```
== npm
```bash
npm install @isaacwasserman/remora react react-dom @xyflow/react
```
== pnpm
```bash
pnpm add @isaacwasserman/remora react react-dom @xyflow/react
```
== yarn
```bash
yarn add @isaacwasserman/remora react react-dom @xyflow/react
```
:::

```tsx
import { WorkflowViewer, StepDetailPanel } from "@isaacwasserman/remora/viewer";
```

See the [Getting Started](/guide/getting-started#visualize-a-workflow) guide for details.

## Registry Endpoint

The registry index is available at:

```
https://isaacwasserman.github.io/remora/r/registry.json
```

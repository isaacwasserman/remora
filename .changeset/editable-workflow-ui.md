---
"@remoraflow/ui": minor
---

Add workflow editing capabilities to WorkflowViewer with new `isEditing`, `onWorkflowChange`, and `tools` props. When editing is enabled, users can add steps from a palette or context menu, edit step properties in a side panel, drag to reposition nodes, connect/disconnect steps, and delete steps. Supports creating workflows from scratch with a null workflow prop. New exports: `StepEditorPanel`, `ExpressionEditor`, `buildEditableLayout`, `createDefaultStep`, `resetStepCounter`.

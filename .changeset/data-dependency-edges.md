---
"@remoraflow/core": minor
"@remoraflow/ui": minor
---

Hovering a step in the workflow viewer now draws animated, curved data-dependency edges between that step and the steps it reads from or that read from it. Set `showDataDependencies={false}` on `WorkflowViewer` to turn this off. Core exports `queryRootNames`, which returns the root identifiers that a JMESPath query reads.

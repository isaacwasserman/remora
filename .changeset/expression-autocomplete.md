---
"@remoraflow/core": minor
"@remoraflow/ui": minor
---

Add expression autocomplete to the workflow editor. The JMESPath and template inputs in `StepEditorPanel` now surface in-scope paths via a Command-based suggestion popover, including `[*].field` projections for arrays of objects. Custom expressions can still be typed freely.

`@remoraflow/core` exports two new utilities for building the scope tree: `getExpressionScope(workflow, graph, tools, stepId)` returns the root identifiers in scope at a step (workflow input, predecessor step outputs, enclosing for-each loop variables) along with their JSON Schemas, and `enumerateSuggestions(scope)` flattens that into a list of suggested paths. Types `ScopeEntry` and `ExpressionSuggestion` are also exported.

`@remoraflow/ui`'s `StepEditorPanel` accepts a new `expressionScope` prop that is provided to descendant `ExpressionEditor`s via context. `WorkflowViewer` wires this up automatically using the latest compiled graph.

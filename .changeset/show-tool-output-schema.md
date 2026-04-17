---
"@remoraflow/ui": minor
---

Show a tool's output schema in the workflow editor. When editing a `tool-call` step, the tool-call params panel now displays the tool's declared `outputSchema` — listing each output field with its type and description (or a compact "returns <type>" summary for non-object schemas) — so users know what data will be available after the tool executes. The raw JSON Schema is available in a collapsible section.

---
"@remoraflow/core": minor
"@remoraflow/ui": minor
---

Preserve JSON Schema `default` values from tool input schemas. `extractToolSchemas` now prefers the validator library's native `toJsonSchema` / `toJSONSchema` method (e.g. arktype, zod v4) when available, so extensions like `default`, `examples`, and `title` are no longer stripped by the AI SDK's `asSchema` wrapper.

The workflow viewer surfaces defaults in the tool-call editor:
- Shown as placeholder text in string, number, JSON, and enum inputs.
- Rendered next to the "+ key" chip for absent optional inputs.
- Displayed as a subtle `default: …` label next to present optional inputs.
- When the user clicks the chip to add an optional input, the input is seeded with the schema's default value (if set) instead of an empty literal.

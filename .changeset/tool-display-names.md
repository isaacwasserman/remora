---
"@remoraflow/core": minor
"@remoraflow/ui": minor
---

Add optional `displayName` to `ToolSchemaDefinition`. The workflow viewer now uses it as the human-friendly label for tools in the tool picker, agent-loop tool list, node canvas, and detail/editor panels. Compiled workflows continue to reference tools by their actual keys. The tool picker dropdown also renders each tool's description underneath its name.

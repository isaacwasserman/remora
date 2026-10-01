---
"@remoraflow/core": minor
---

Add `renderWorkflowAsText`, which explains a workflow in plain language as a numbered list of steps. Each step combines its description with a sentence about what it does. Branches, loops, and waits say which step comes next, and references to earlier results name the step they come from. `renderWorkflowAsMarkdown` gives the same explanation as Markdown, with code spans, fenced prompts, and nested bullet lists. Also add `describeJsonSchemaType`, which gives a compact TypeScript-like description of a JSON Schema.

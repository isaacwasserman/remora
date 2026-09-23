---
"@remoraflow/core": minor
---

Workflow generation now edits a draft workflow in place instead of resubmitting the full definition on every attempt. The agent uses `write-workflow`, `read-workflow` (JMESPath), `edit-workflow` (JSON Patch), and `submit-workflow`. Write and edit return validation diagnostics without failing the tool call.

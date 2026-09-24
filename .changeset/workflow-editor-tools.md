---
"@remoraflow/core": minor
---

Workflow generation now edits a draft workflow in place instead of resubmitting the full definition on every attempt. The agent uses `write-workflow`, `read-workflow` (JMESPath), `edit-workflow` (JSON Patch), and `submit-workflow`. Write and edit return validation diagnostics without failing the tool call, edits also return the changed workflow, and both accept `submitIfValid` to submit a workflow that has no errors or warnings without a separate call. An edit that uses `replace` on a field that does not exist adds the field. When a required output schema is given and the workflow declares no `outputSchema`, the required schema is used. Tool calls whose top-level object or array arguments were sent as JSON strings are repaired. The generation instructions are marked as an Anthropic prompt-cache breakpoint. `step-end` diagnostic events now include each step's tool calls, with the input and error of failed calls.

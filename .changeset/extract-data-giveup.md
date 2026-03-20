---
"@remoraflow/core": minor
---

Add give-up tool to extract-data inline mode to allow LLM to fail gracefully when requested data is not available in the source, matching probe mode behavior. When the LLM calls give-up, the step throws an ExtractionError and fails the workflow.

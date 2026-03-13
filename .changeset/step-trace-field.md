---
"@isaacwasserman/remora": minor
---

Add optional `trace` field to `StepExecutionRecord` for capturing intermediate processing steps. Trace entries are a discriminated union with `log` (generic debug messages) and `agent-step` (raw AI SDK step data) types. LLM-based steps (agent-loop, llm-prompt, extract-data) now automatically populate trace entries with their intermediate AI SDK steps.

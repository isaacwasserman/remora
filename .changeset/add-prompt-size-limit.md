---
"@remoraflow/core": minor
---

Add prompt size limits to prevent context window overflow in LLM prompts and workflows.

- Compile-time validation: emits `PROMPT_TEMPLATE_EXCEEDS_TOKEN_LIMIT` error when a prompt template exceeds the configured token limit
- Execution-time truncation: proportionally truncates interpolated variable portions to fit within the total prompt token limit, with per-variable caps and truncation disclaimers
- Configurable via `maxPromptTokens` (compiler + executor) and `maxPromptVariableTokens` (executor), defaulting to 100k and 5k tokens respectively
- Uses the `tokenx` package for fast token estimation

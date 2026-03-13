---
'@isaacwasserman/remora': minor
---

Use AI SDK's Output.object() for structured output in LLM steps. All LLM step handlers (llm-prompt, extract-data, agent-loop) now use structured output to guarantee valid JSON from the model, eliminating parse errors. Simplifies the public API: `executeWorkflow` now accepts `model: LanguageModel` instead of `agent: Agent | LanguageModel`.

---
'@isaacwasserman/remora': minor
---

Add agent-loop step type for autonomous agent execution

This new step type allows delegating work to an autonomous agent with its own tool-calling loop. It supports both LanguageModel and pre-configured Agent instances. Marked "use sparingly" to preserve framework determinism.
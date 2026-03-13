---
'@isaacwasserman/remora': minor
---

Restore Agent support for agent-loop steps. `executeWorkflow` now accepts an optional `agent` alongside `model`. When provided, agent-loop steps use the Agent's own tools and behaviors, then the bare model coerces the Agent's text output into structured output via `Output.object()`. A give-up tool is provided to the coercion step so it can signal when the Agent's output cannot be parsed into the expected schema.

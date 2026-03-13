---
'@isaacwasserman/remora': patch
---

Accept Agent with any type parameters in ExecutorOptions. The generic parameters of the Agent type are not relevant when accepting an agent, so the type now explicitly accepts `Agent<any, any, any>` to avoid unnecessarily constraining callers.

---
"@remoraflow/ui": minor
---

Add optional `toolSchemas` prop to `WorkflowViewer` to accept pre-extracted tool metadata directly, enabling server-side tool definitions. Move demo tools to server-side with SSRF-hardened fetch tool featuring DNS rebinding detection, port/IP restrictions, rate limiting, and response size limits.

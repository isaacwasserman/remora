---
---

Fix botid runtime error by moving client initialization to main.tsx. The initBotId() call from botid/client/core references window and must run in the browser, not in server-side Nitro plugins.

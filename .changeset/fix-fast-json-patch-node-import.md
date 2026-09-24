---
"@remoraflow/core": patch
---

Fix a startup error in Node ESM ("Named export 'applyOperation' not found"): `fast-json-patch` is now imported through its default export.

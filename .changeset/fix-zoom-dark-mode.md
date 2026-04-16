---
"@remoraflow/ui": patch
---

Fix React Flow controls (zoom in/out/fit-view) not respecting dark mode when the host app toggles `dark` on `<html>`. The workflow viewer now forwards its detected color mode to React Flow via the `colorMode` prop so the built-in controls styling picks up the correct dark palette.

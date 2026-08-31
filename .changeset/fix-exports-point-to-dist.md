---
"@remoraflow/core": patch
"@remoraflow/ui": patch
---

Fix package exports to point at built output in `dist/` instead of unpublished source files. Core's exports were a bare `./src/index.ts` (not in the tarball); UI had a `bun` condition with the same problem. Both now use only `import` and `types` conditions targeting `dist/`.

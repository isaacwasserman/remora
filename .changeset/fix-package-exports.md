---
"@remoraflow/core": patch
---

Remove `bun` conditional export entries that pointed to source files (`./src/lib.ts`, `./src/executor/adapters/aws-lambda.ts`) not included in the published tarball. Under the bun runtime, Node-style conditional export resolution picked the `bun` condition first, causing `Cannot find module '@remoraflow/core'` errors for consumers installing from npm. The `import` condition (`./dist/...`) is now used for all runtimes.

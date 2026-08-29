---
"@remoraflow/core": patch
---

Internal refactor: colocate the JMESPath and JSON-Schema static-analysis utilities under a single `src/schemistry/` module. This groups the JMESPath output-type inference (`inferQueryOutputSchema`, `unionSchemas`), value→schema inference (`inferJsonSchema`, formerly `inferRemoraflowType`), schema-subset diagnostics (`schemaSubsetDiagnostics`), structural summarization (`summarizeObjectStructure`), Standard Schema helpers, and template extraction behind one internal barrel. No public API or behavior change. Also drops the unused `@jmespath-community/jmespath` dependency.

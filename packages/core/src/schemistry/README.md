# schemistry

Static type analysis for data-shaping expressions.

These modules reason about the *shape* of data without ever running it. JMESPath is
the query language; JSON Schema is the type system. Given the type of an input and
an expression that transforms it, schemistry computes the type of the output and
proves — at analysis time, not runtime — which accesses can never resolve.
schemistry is to JMESPath what a type-checker is to a programming language: it turns
"run it and see what breaks" into "know what you'll get before you run it."

It's colocated here as an internal module, structured as if it were a standalone
package so it can be spun out later.

## Surface

Import everything from the barrel (`./schemistry`).

- `inferQueryOutputSchema(inputSchema, query)` — given an input JSON Schema and a
  JMESPath query, returns the JSON Schema of the result, annotated with `badAccess`
  markers, plus a list of `BadAccessDiagnostic`s for every access that provably
  can't resolve. The headline feature.
- `unionSchemas(schemas)` — merge JSON Schemas into a deduped `anyOf`.
- `inferJsonSchema(value)` — infer a JSON Schema from a concrete value (`const` for
  scalars, tuple vs. uniform arrays).
- `schemaSubsetDiagnostics(sub, sup)` — report where the value set of `sub` isn't
  guaranteed to satisfy `sup`, localized to property/index paths.
- `summarizeObjectStructure(value)` / `inferSchema(value)` — compact, human-readable
  structural summary of a large value (for logs/prompts).
- `validateAgainstStandardSchema(value, schema)` — synchronous Standard Schema
  validation.
- `extractTemplateInserts(templateString)` — extract `${…}` inserts with offsets.

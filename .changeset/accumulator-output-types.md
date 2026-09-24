---
"@remoraflow/core": patch
---

The validator now types a `for-each` or `while` accumulator from its loop body's output, so an accumulator that builds the wrong shape is reported as an error. It warns separately when the initial value, which the loop outputs if the body never runs, does not match the body's output. Type inference also flattens lists of arrays correctly, types empty literal arrays as arrays with no items, checks each member of a union and each tuple item against the target schema, and treats different JSON Schema types as disjoint. The `for-each` and `while` step descriptions now explain how to collect outputs without an accumulator and how to append to an array accumulator.

---
"@remoraflow/core": patch
"@remoraflow/ui": patch
---

The validator now reports calls to JMESPath functions that do not exist, such as `append()`, instead of letting them fail at runtime. The list of JMESPath functions is exported as `JMESPATH_FUNCTION_NAMES`, and the UI's syntax highlighting uses it.

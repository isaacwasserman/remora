---
"@remoraflow/core": patch
---

Improve workflow text and Markdown rendering: multi-line values (queries, templates, expressions) are shown in fenced or indented blocks instead of escaped one-line strings, inline code spans use a backtick fence longer than any run in the value so they can no longer close early, and when a step has a description, what the step does is listed as a bullet beneath it.

---
"@remoraflow/ui": patch
---

Fix switch-case edges with empty `branchBodyStepId` targets in the graph layout. When a case's `branchBodyStepId` is `""` (e.g. from a newly-added case/default or after `clearChildRef`), the layout no longer emits an edge pointing at the non-existent node id `""`.

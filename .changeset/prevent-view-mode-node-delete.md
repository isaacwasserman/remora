---
"@remoraflow/ui": patch
---

Prevent node deletion in the workflow viewer when editing is disabled. React Flow's built-in delete-key handler removed selected nodes even in view mode; the delete key is now disabled and `remove` node changes are ignored unless `isEditing` is true.

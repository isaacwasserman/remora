# @isaacwasserman/remora

## 0.2.1

### Patch Changes

- 1c36011: Fix CI publish step that silently skipped npm publish due to changesets/action splitting shell operators as arguments

## 0.2.0

### Minor Changes

- 9dd1e43: Add `sleep` and `wait-for-condition` workflow step types for time-based delays and polling-based condition checks during workflow execution

### Patch Changes

- 8623f9f: Fix canary publish workflow failing when a changeset has no package bump

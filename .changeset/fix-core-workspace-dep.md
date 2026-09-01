---
"@remoraflow/ui": patch
---

Fix @remoraflow/core resolving as uninstallable `workspace:*` for npm consumers by switching publish to `bun publish`, which resolves workspace protocols to real semver ranges.

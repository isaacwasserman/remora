---
"@remoraflow/ui": patch
---

Fix @remoraflow/core resolving as uninstallable `workspace:*` for npm consumers by replacing the workspace protocol with a standard semver range managed by changesets.

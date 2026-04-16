---
"@remoraflow/ui": patch
---

Fix three shadcn component registry bugs that broke installs:

- The registry import-rewriter kept relative paths (e.g. `../../components/ui/combobox`) for any file shipped by the registry, including `registry:ui` files. shadcn relocates `registry:ui` files to the consumer's ui alias, so those sibling-relative imports failed to resolve after install. Imports that resolve under `components/ui/` or `lib/` are now always rewritten to the `@/` alias.
- Renamed the custom `combobox.tsx` ui primitive to `workflow-combobox.tsx` so it no longer overwrites the consumer's existing `ui/combobox.tsx` (shadcn's public registry has no combobox, so every consumer's combobox is a roll-your-own at that path). The exported `Combobox*` names from `@remoraflow/ui` are unchanged.
- The `workflow-step-detail-panel` registry item duplicated six files already shipped by `workflow-viewer`, so installing both produced two copies of every shared file. The panel item now declares `workflow-viewer` as a `registryDependencies` entry and ships no files of its own.

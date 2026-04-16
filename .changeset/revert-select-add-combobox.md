---
"@remoraflow/ui": minor
---

Revert `select.tsx` to the standard shadcn version and introduce a new `Combobox` component. The combobox is built on `@base-ui/react` following the shadcn Combobox guide and supports items with values, labels, and descriptions (`ComboboxItemTitle`, `ComboboxItemDescription`). The tool-call step editor now uses the combobox for tool selection. The combobox ships as part of the `workflow-viewer` registry item.

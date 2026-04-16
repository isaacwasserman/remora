---
"@remoraflow/ui": minor
---

Rewrite the `Combobox` component on top of Radix Popover + `cmdk`, matching the
rest of the shadcn primitives in the registry and dropping the `@base-ui/react`
dependency. Also ships standard shadcn `Popover`, `Command`, and `Dialog`
primitives so the combobox composes cleanly.

**Breaking**: the combobox now uses a trigger + popover + command-list
composition (matching the shadcn docs example). The `items` / `value` /
`onValueChange` render-prop API, chip primitives (`ComboboxChips`,
`ComboboxChip`, `ComboboxChipsInput`), and the `useComboboxAnchor` helper are
removed. Use `<ComboboxTrigger>` to display the selected value, wrap
`ComboboxItem`s in a `ComboboxGroup`, and handle selection with `onSelect` on
each item.

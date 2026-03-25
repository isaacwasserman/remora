---
"@remoraflow/ui": minor
---

Ship compiled CSS with the package for zero-config styling support.

**New:** `import '@remoraflow/ui/styles.css'` — npm consumers should add this import to get all Tailwind utility classes and sensible default theme variables. Without it, compound utility classes (e.g. `dark:shadow-foreground/[0.06]`, `bg-muted-foreground/70`, `data-[state=active]:bg-foreground`) won't have matching CSS rules in consuming apps that don't scan `node_modules`.

The shipped CSS includes default light/dark theme variables that work out of the box. Consumers using shadcn/ui can override these by defining their own CSS variables. For full theme control, add `@source` for the package in your Tailwind CSS config.

**New props:**
- `WorkflowViewer`: added `hideDetailPanel` prop to suppress the built-in detail/editor panel, allowing consumers to render `StepDetailPanel` or `StepEditorPanel` externally without duplication.

**New exports:**
- `StepPalette` and `StepPaletteProps` are now exported for external rendering.

---
"@remoraflow/ui": minor
---

Stop auto-importing styles.css as a side effect of importing components. Consumers who need the default theme should now import `@remoraflow/ui/styles.css` explicitly. A new `@remoraflow/ui/styles-base.css` export is available for apps that already define their own shadcn-compatible CSS variables and only need the Tailwind theme mappings without the default :root values.

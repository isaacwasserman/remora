import type * as React from "react";

import { cn } from "../../lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "rf:h-9 rf:w-full rf:min-w-0 rf:rounded-md border rf:border-input rf:bg-transparent rf:px-3 rf:py-1 rf:text-base rf:shadow-xs rf:transition-[color,box-shadow] rf:outline-none rf:selection:bg-primary rf:selection:text-primary-foreground rf:file:inline-flex rf:file:h-7 rf:file:border-0 rf:file:bg-transparent rf:file:text-sm rf:file:font-medium rf:file:text-foreground rf:placeholder:text-muted-foreground rf:disabled:pointer-events-none rf:disabled:cursor-not-allowed rf:disabled:opacity-50 rf:md:text-sm rf:dark:bg-input/30",
        "rf:focus-visible:border-ring rf:focus-visible:ring-[3px] rf:focus-visible:ring-ring/50",
        "rf:aria-invalid:border-destructive rf:aria-invalid:ring-destructive/20 rf:dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  );
}

export { Input };

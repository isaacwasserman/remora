import type * as React from "react";

import { cn } from "../../lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "rf:flex rf:field-sizing-content rf:min-h-16 rf:w-full rf:rounded-md border rf:border-input rf:bg-transparent rf:px-3 rf:py-2 rf:text-base rf:shadow-xs rf:transition-[color,box-shadow] rf:outline-none rf:placeholder:text-muted-foreground rf:focus-visible:border-ring rf:focus-visible:ring-[3px] rf:focus-visible:ring-ring/50 rf:disabled:cursor-not-allowed rf:disabled:opacity-50 rf:aria-invalid:border-destructive rf:aria-invalid:ring-destructive/20 rf:md:text-sm rf:dark:bg-input/30 rf:dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };

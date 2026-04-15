"use client";

import { Label as LabelPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "../../lib/utils";

function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "rf:flex rf:items-center rf:gap-2 rf:text-sm rf:leading-none rf:font-medium rf:select-none rf:group-data-[disabled=true]:pointer-events-none rf:group-data-[disabled=true]:opacity-50 rf:peer-disabled:cursor-not-allowed rf:peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Label };

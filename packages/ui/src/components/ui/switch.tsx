import { Switch as SwitchPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "../../lib/utils";

function Switch({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default";
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "rf:peer rf:group/switch rf:inline-flex rf:shrink-0 rf:items-center rf:rounded-full border rf:border-transparent rf:shadow-xs rf:transition-all rf:outline-none rf:focus-visible:border-ring rf:focus-visible:ring-[3px] rf:focus-visible:ring-ring/50 rf:disabled:cursor-not-allowed rf:disabled:opacity-50 rf:data-[size=default]:h-[1.15rem] rf:data-[size=default]:w-8 rf:data-[size=sm]:h-3.5 rf:data-[size=sm]:w-6 rf:data-[state=checked]:bg-primary rf:data-[state=unchecked]:bg-input rf:dark:data-[state=unchecked]:bg-input/80",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="rf:switch-thumb"
        className={cn(
          "rf:pointer-events-none rf:block rf:rounded-full rf:bg-background rf:ring-0 rf:transition-transform rf:group-data-[size=default]/switch:size-4 rf:group-data-[size=sm]/switch:size-3 rf:data-[state=checked]:translate-x-[calc(100%-2px)] rf:data-[state=unchecked]:translate-x-0 rf:dark:data-[state=checked]:bg-primary-foreground rf:dark:data-[state=unchecked]:bg-foreground",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };

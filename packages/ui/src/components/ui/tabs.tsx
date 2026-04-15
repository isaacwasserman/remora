import { Tabs as TabsPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "../../lib/utils";

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("rf:flex rf:flex-col rf:gap-2", className)}
      {...props}
    />
  );
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="rf:tabs-list"
      className={cn(
        "rf:inline-flex rf:w-fit rf:items-center rf:justify-center rf:rounded-lg rf:bg-muted/50 rf:p-0.5 rf:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="rf:tabs-trigger"
      className={cn(
        "rf:inline-flex rf:items-center rf:justify-center rf:whitespace-nowrap rf:rounded-md rf:px-2.5 rf:py-1 rf:text-[11px] rf:font-medium rf:transition-all rf:disabled:pointer-events-none rf:disabled:opacity-50 rf:data-[state=active]:bg-foreground rf:data-[state=active]:text-background rf:data-[state=active]:shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="rf:tabs-content"
      className={cn("rf:flex-1 rf:outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger };

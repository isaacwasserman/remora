import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { Select as SelectPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "../../lib/utils";

function Select({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />;
}

function _SelectGroup({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot="rf:select-group" {...props} />;
}

function SelectValue({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="rf:select-value" {...props} />;
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  size?: "sm" | "default";
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="rf:select-trigger"
      data-size={size}
      className={cn(
        "rf:flex rf:w-fit rf:items-center rf:justify-between rf:gap-2 rf:rounded-md border rf:border-input rf:bg-transparent rf:px-3 rf:py-2 rf:text-sm rf:whitespace-nowrap rf:shadow-xs rf:transition-[color,box-shadow] rf:outline-none rf:focus-visible:border-ring rf:focus-visible:ring-[3px] rf:focus-visible:ring-ring/50 rf:disabled:cursor-not-allowed rf:disabled:opacity-50 rf:aria-invalid:border-destructive rf:aria-invalid:ring-destructive/20 rf:data-[placeholder]:text-muted-foreground rf:data-[size=default]:h-9 rf:data-[size=sm]:h-8 rf:*:data-[slot=select-value]:line-clamp-1 rf:*:data-[slot=select-value]:flex rf:*:data-[slot=select-value]:items-center rf:*:data-[slot=select-value]:gap-2 rf:dark:bg-input/30 rf:dark:hover:bg-input/50 rf:dark:aria-invalid:ring-destructive/40 rf:[rf:[[&_svg]:_svg]:_svg]:pointer-events-none rf:[rf:[[&_svg]:_svg]:_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon className="rf:size-4 rf:opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  children,
  position = "item-aligned",
  align = "center",
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="rf:select-content"
        className={cn(
          "rf:relative rf:z-50 rf:max-h-(--radix-select-content-available-height) rf:min-w-[8rem] rf:origin-(--radix-select-content-transform-origin) rf:overflow-x-hidden rf:overflow-y-auto rf:rounded-md border rf:bg-popover rf:text-popover-foreground rf:shadow-md rf:data-[side=bottom]:slide-in-from-top-2 rf:data-[side=left]:slide-in-from-right-2 rf:data-[side=right]:slide-in-from-left-2 rf:data-[side=top]:slide-in-from-bottom-2 rf:data-[state=closed]:animate-out rf:data-[state=closed]:fade-out-0 rf:data-[state=closed]:zoom-out-95 rf:data-[state=open]:animate-in rf:data-[state=open]:fade-in-0 rf:data-[state=open]:zoom-in-95",
          position === "popper" &&
            "rf:data-[side=bottom]:translate-y-1 rf:data-[side=left]:-translate-x-1 rf:data-[side=right]:translate-x-1 rf:data-[side=top]:-translate-y-1",
          className,
        )}
        position={position}
        align={align}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={cn(
            "rf:p-1",
            position === "popper" &&
              "rf:h-[var(--radix-select-trigger-height)] rf:w-full rf:min-w-[var(--radix-select-trigger-width)] rf:scroll-my-1",
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

function _SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="rf:select-label"
      className={cn(
        "rf:px-2 rf:py-1.5 rf:text-xs rf:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="rf:select-item"
      className={cn(
        "rf:relative rf:flex rf:w-full rf:cursor-default rf:items-center rf:gap-2 rf:rounded-sm rf:py-1.5 rf:pr-8 rf:pl-2 rf:text-sm rf:outline-hidden rf:select-none rf:focus:bg-accent rf:focus:text-accent-foreground rf:data-[disabled]:pointer-events-none rf:data-[disabled]:opacity-50 rf:[rf:[[&_svg]:_svg]:_svg]:pointer-events-none rf:[rf:[[&_svg]:_svg]:_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground rf:*:[span]:last:flex rf:*:[span]:last:items-center rf:*:[span]:last:gap-2",
        className,
      )}
      {...props}
    >
      <span
        data-slot="rf:select-item-indicator"
        className="rf:absolute rf:right-2 rf:flex rf:size-3.5 rf:items-center rf:justify-center"
      >
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="rf:size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

function _SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="rf:select-separator"
      className={cn(
        "rf:pointer-events-none rf:-mx-1 rf:my-1 rf:h-px rf:bg-border",
        className,
      )}
      {...props}
    />
  );
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton
      data-slot="rf:select-scroll-up-button"
      className={cn(
        "rf:flex rf:cursor-default rf:items-center rf:justify-center rf:py-1",
        className,
      )}
      {...props}
    >
      <ChevronUpIcon className="rf:size-4" />
    </SelectPrimitive.ScrollUpButton>
  );
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton
      data-slot="rf:select-scroll-down-button"
      className={cn(
        "rf:flex rf:cursor-default rf:items-center rf:justify-center rf:py-1",
        className,
      )}
      {...props}
    >
      <ChevronDownIcon className="rf:size-4" />
    </SelectPrimitive.ScrollDownButton>
  );
}

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue };

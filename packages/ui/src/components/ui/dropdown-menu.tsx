"use client";

import { CheckIcon, ChevronRightIcon, CircleIcon } from "lucide-react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "../../lib/utils";

function DropdownMenu({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="rf:dropdown-menu" {...props} />;
}

function DropdownMenuPortal({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Portal>) {
  return (
    <DropdownMenuPrimitive.Portal
      data-slot="rf:dropdown-menu-portal"
      {...props}
    />
  );
}

function DropdownMenuTrigger({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return (
    <DropdownMenuPrimitive.Trigger
      data-slot="rf:dropdown-menu-trigger"
      {...props}
    />
  );
}

function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="rf:dropdown-menu-content"
        sideOffset={sideOffset}
        className={cn(
          "rf:z-50 rf:max-h-(--radix-dropdown-menu-content-available-height) rf:min-w-[8rem] rf:origin-(--radix-dropdown-menu-content-transform-origin) rf:overflow-x-hidden rf:overflow-y-auto rf:rounded-md border rf:bg-popover rf:p-1 rf:text-popover-foreground rf:shadow-md rf:data-[side=bottom]:slide-in-from-top-2 rf:data-[side=left]:slide-in-from-right-2 rf:data-[side=right]:slide-in-from-left-2 rf:data-[side=top]:slide-in-from-bottom-2 rf:data-[state=closed]:animate-out rf:data-[state=closed]:fade-out-0 rf:data-[state=closed]:zoom-out-95 rf:data-[state=open]:animate-in rf:data-[state=open]:fade-in-0 rf:data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

function DropdownMenuGroup({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Group>) {
  return (
    <DropdownMenuPrimitive.Group
      data-slot="rf:dropdown-menu-group"
      {...props}
    />
  );
}

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  inset?: boolean;
  variant?: "default" | "destructive";
}) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="rf:dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "rf:relative rf:flex rf:cursor-default rf:items-center rf:gap-2 rf:rounded-sm rf:px-2 rf:py-1.5 rf:text-sm rf:outline-hidden rf:select-none rf:focus:bg-accent rf:focus:text-accent-foreground rf:data-[disabled]:pointer-events-none rf:data-[disabled]:opacity-50 rf:data-[inset]:pl-8 rf:data-[variant=destructive]:text-destructive rf:data-[variant=destructive]:focus:bg-destructive/10 rf:data-[variant=destructive]:focus:text-destructive rf:dark:data-[variant=destructive]:focus:bg-destructive/20 rf:[rf:[[&_svg]:_svg]:_svg]:pointer-events-none rf:[rf:[[&_svg]:_svg]:_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground rf:data-[variant=destructive]:*:[svg]:text-destructive!",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-slot="rf:dropdown-menu-checkbox-item"
      className={cn(
        "rf:relative rf:flex rf:cursor-default rf:items-center rf:gap-2 rf:rounded-sm rf:py-1.5 rf:pr-2 rf:pl-8 rf:text-sm rf:outline-hidden rf:select-none rf:focus:bg-accent rf:focus:text-accent-foreground rf:data-[disabled]:pointer-events-none rf:data-[disabled]:opacity-50 rf:[rf:[[&_svg]:_svg]:_svg]:pointer-events-none rf:[rf:[[&_svg]:_svg]:_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      checked={checked}
      {...props}
    >
      <span className="rf:pointer-events-none rf:absolute rf:left-2 rf:flex rf:size-3.5 rf:items-center rf:justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <CheckIcon className="rf:size-4" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

function DropdownMenuRadioGroup({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>) {
  return (
    <DropdownMenuPrimitive.RadioGroup
      data-slot="rf:dropdown-menu-radio-group"
      {...props}
    />
  );
}

function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
  return (
    <DropdownMenuPrimitive.RadioItem
      data-slot="rf:dropdown-menu-radio-item"
      className={cn(
        "rf:relative rf:flex rf:cursor-default rf:items-center rf:gap-2 rf:rounded-sm rf:py-1.5 rf:pr-2 rf:pl-8 rf:text-sm rf:outline-hidden rf:select-none rf:focus:bg-accent rf:focus:text-accent-foreground rf:data-[disabled]:pointer-events-none rf:data-[disabled]:opacity-50 rf:[rf:[[&_svg]:_svg]:_svg]:pointer-events-none rf:[rf:[[&_svg]:_svg]:_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <span className="rf:pointer-events-none rf:absolute rf:left-2 rf:flex rf:size-3.5 rf:items-center rf:justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <CircleIcon className="rf:size-2 rf:fill-current" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label> & {
  inset?: boolean;
}) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot="rf:dropdown-menu-label"
      data-inset={inset}
      className={cn(
        "rf:px-2 rf:py-1.5 rf:text-sm rf:font-medium rf:data-[inset]:pl-8",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="rf:dropdown-menu-separator"
      className={cn("rf:-mx-1 rf:my-1 rf:h-px rf:bg-border", className)}
      {...props}
    />
  );
}

function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="rf:dropdown-menu-shortcut"
      className={cn(
        "rf:ml-auto rf:text-xs rf:tracking-widest rf:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuSub({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Sub>) {
  return (
    <DropdownMenuPrimitive.Sub data-slot="rf:dropdown-menu-sub" {...props} />
  );
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger> & {
  inset?: boolean;
}) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      data-slot="rf:dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        "rf:flex rf:cursor-default rf:items-center rf:gap-2 rf:rounded-sm rf:px-2 rf:py-1.5 rf:text-sm rf:outline-hidden rf:select-none rf:focus:bg-accent rf:focus:text-accent-foreground rf:data-[inset]:pl-8 rf:data-[state=open]:bg-accent rf:data-[state=open]:text-accent-foreground rf:[rf:[[&_svg]:_svg]:_svg]:pointer-events-none rf:[rf:[[&_svg]:_svg]:_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="rf:ml-auto rf:size-4" />
    </DropdownMenuPrimitive.SubTrigger>
  );
}

function DropdownMenuSubContent({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  return (
    <DropdownMenuPrimitive.SubContent
      data-slot="rf:dropdown-menu-sub-content"
      className={cn(
        "rf:z-50 rf:min-w-[8rem] rf:origin-(--radix-dropdown-menu-content-transform-origin) rf:overflow-hidden rf:rounded-md border rf:bg-popover rf:p-1 rf:text-popover-foreground rf:shadow-lg rf:data-[side=bottom]:slide-in-from-top-2 rf:data-[side=left]:slide-in-from-right-2 rf:data-[side=right]:slide-in-from-left-2 rf:data-[side=top]:slide-in-from-bottom-2 rf:data-[state=closed]:animate-out rf:data-[state=closed]:fade-out-0 rf:data-[state=closed]:zoom-out-95 rf:data-[state=open]:animate-in rf:data-[state=open]:fade-in-0 rf:data-[state=open]:zoom-in-95",
        className,
      )}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
};

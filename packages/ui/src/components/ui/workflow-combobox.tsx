"use client";

import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import type * as React from "react";

import { cn } from "../../lib/utils";
import { Button } from "./button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

function Combobox({ ...props }: React.ComponentProps<typeof Popover>) {
  return <Popover data-slot="combobox" {...props} />;
}

function ComboboxTrigger({
  className,
  children,
  placeholder,
  ...props
}: React.ComponentProps<typeof Button> & { placeholder?: string }) {
  return (
    <PopoverTrigger asChild>
      <Button
        data-slot="combobox-trigger"
        variant="outline"
        role="combobox"
        className={cn(
          "w-full justify-between font-normal data-[placeholder]:text-muted-foreground",
          className,
        )}
        {...props}
      >
        <span
          data-slot="combobox-trigger-value"
          className="truncate text-left"
          {...(children == null ? { "data-placeholder": "" } : {})}
        >
          {children ?? placeholder}
        </span>
        <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
      </Button>
    </PopoverTrigger>
  );
}

function ComboboxContent({
  className,
  children,
  align = "start",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof PopoverContent>) {
  return (
    <PopoverContent
      data-slot="combobox-content"
      align={align}
      sideOffset={sideOffset}
      className={cn(
        "w-(--radix-popover-trigger-width) min-w-[var(--radix-popover-trigger-width)] p-0",
        className,
      )}
      {...props}
    >
      <Command>{children}</Command>
    </PopoverContent>
  );
}

function ComboboxInput({
  ...props
}: React.ComponentProps<typeof CommandInput>) {
  return <CommandInput data-slot="combobox-input" {...props} />;
}

function ComboboxList({ ...props }: React.ComponentProps<typeof CommandList>) {
  return <CommandList data-slot="combobox-list" {...props} />;
}

function ComboboxEmpty({
  ...props
}: React.ComponentProps<typeof CommandEmpty>) {
  return <CommandEmpty data-slot="combobox-empty" {...props} />;
}

function ComboboxGroup({
  ...props
}: React.ComponentProps<typeof CommandGroup>) {
  return <CommandGroup data-slot="combobox-group" {...props} />;
}

function ComboboxItem({
  className,
  children,
  selected = false,
  ...props
}: React.ComponentProps<typeof CommandItem> & { selected?: boolean }) {
  return (
    <CommandItem
      data-slot="combobox-item"
      className={cn("flex items-start gap-2", className)}
      {...props}
    >
      <CheckIcon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          selected ? "opacity-100" : "opacity-0",
        )}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">{children}</div>
    </CommandItem>
  );
}

function ComboboxItemTitle({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="combobox-item-title"
      className={cn("truncate leading-tight font-medium", className)}
      {...props}
    />
  );
}

function ComboboxItemDescription({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="combobox-item-description"
      className={cn(
        "text-[11px] leading-snug whitespace-normal text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemDescription,
  ComboboxItemTitle,
  ComboboxList,
  ComboboxTrigger,
};

import type { ExpressionSuggestion } from "@remoraflow/core";
import { Command as CommandPrimitive } from "cmdk";
import { useId, useRef, useState } from "react";
import {
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "../components/ui/command";
import { Input } from "../components/ui/input";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "../components/ui/popover";
import { cn } from "../lib/utils";

const ROOT_KIND_LABEL: Record<ExpressionSuggestion["rootKind"], string> = {
  input: "input",
  stepOutput: "step",
  loopVar: "loop",
};

interface ExpressionInputProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: ExpressionSuggestion[] | null;
  placeholder?: string;
  className?: string;
}

/**
 * A free-text input for JMESPath expressions that surfaces in-scope paths via
 * a Command-based suggestion popover. The user can pick a suggestion or type
 * any custom expression.
 */
export function ExpressionInput({
  value,
  onChange,
  suggestions,
  placeholder,
  className,
}: ExpressionInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const hasSuggestions = !!suggestions && suggestions.length > 0;

  if (!hasSuggestions) {
    return (
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn("h-8 text-xs font-mono", className)}
        placeholder={placeholder}
      />
    );
  }

  return (
    <CommandPrimitive shouldFilter>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <CommandPrimitive.Input
            ref={inputRef}
            value={value}
            onValueChange={(v) => {
              onChange(v);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={(e) => {
              const next = e.relatedTarget as HTMLElement | null;
              if (next?.closest("[data-slot=popover-content]")) return;
              setOpen(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setOpen(false);
                e.preventDefault();
              }
            }}
            placeholder={placeholder}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            autoComplete="off"
            spellCheck={false}
            className={cn(
              "flex h-8 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-xs font-mono shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30",
              className,
            )}
          />
        </PopoverAnchor>
        <PopoverContent
          align="start"
          sideOffset={4}
          className="w-(--radix-popover-trigger-width) min-w-[var(--radix-popover-trigger-width)] p-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => {
            if (
              inputRef.current &&
              e.target instanceof Node &&
              inputRef.current.contains(e.target)
            ) {
              e.preventDefault();
            }
          }}
        >
          <CommandList id={listId} className="max-h-[240px]">
            <CommandEmpty>No matching paths.</CommandEmpty>
            <CommandGroup>
              {suggestions.map((s) => (
                <CommandItem
                  key={s.path}
                  value={s.path}
                  onSelect={() => {
                    onChange(s.path);
                    setOpen(false);
                    inputRef.current?.focus();
                  }}
                  className="flex flex-col items-start gap-0.5 py-1.5"
                >
                  <div className="flex w-full items-center gap-2">
                    <span className="font-mono text-xs truncate flex-1 min-w-0">
                      {s.path}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {ROOT_KIND_LABEL[s.rootKind]}
                      {s.type ? ` · ${s.type}` : ""}
                    </span>
                  </div>
                  {s.description && (
                    <span className="text-[10px] text-muted-foreground/80 leading-snug truncate w-full">
                      {s.description}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </PopoverContent>
      </Popover>
    </CommandPrimitive>
  );
}

import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "rf:inline-flex rf:shrink-0 rf:items-center rf:justify-center rf:gap-2 rf:rounded-md rf:text-sm rf:font-medium rf:whitespace-nowrap rf:transition-all rf:outline-none rf:focus-visible:border-ring rf:focus-visible:ring-[3px] rf:focus-visible:ring-ring/50 rf:disabled:pointer-events-none rf:disabled:opacity-50 rf:aria-invalid:border-destructive rf:aria-invalid:ring-destructive/20 rf:dark:aria-invalid:ring-destructive/40 rf:[rf:[[&_svg]:_svg]:_svg]:pointer-events-none rf:[rf:[[&_svg]:_svg]:_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "rf:bg-primary rf:text-primary-foreground rf:hover:bg-primary/90",
        destructive:
          "rf:bg-destructive rf:text-white rf:hover:bg-destructive/90 rf:focus-visible:ring-destructive/20 rf:dark:bg-destructive/60 rf:dark:focus-visible:ring-destructive/40",
        outline:
          "border rf:bg-background rf:shadow-xs rf:hover:bg-accent rf:hover:text-accent-foreground rf:dark:border-input rf:dark:bg-input/30 rf:dark:hover:bg-input/50",
        secondary:
          "rf:bg-secondary rf:text-secondary-foreground rf:hover:bg-secondary/80",
        ghost:
          "rf:hover:bg-accent rf:hover:text-accent-foreground rf:dark:hover:bg-accent/50",
        link: "rf:text-primary rf:underline-offset-4 rf:hover:underline",
      },
      size: {
        default: "rf:h-9 rf:px-4 rf:py-2 rf:has-[>svg]:px-3",
        xs: "rf:h-6 rf:gap-1 rf:rounded-md rf:px-2 rf:text-xs rf:has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "rf:h-8 rf:gap-1.5 rf:rounded-md rf:px-3 rf:has-[>svg]:px-2.5",
        lg: "rf:h-10 rf:rounded-md rf:px-6 rf:has-[>svg]:px-4",
        icon: "rf:size-9",
        "icon-xs":
          "rf:size-6 rf:rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "rf:size-8",
        "icon-lg": "rf:size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button };

import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

export function Code({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <pre
            className={cn(
                "max-h-[200px] overflow-auto whitespace-pre-wrap rounded-md border border-border/50 bg-muted/60 p-2.5 font-mono text-xs text-foreground",
                className,
            )}
        >
            {children}
        </pre>
    );
}

export function CodeBlock({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "rounded-md border border-border/50 bg-muted/60 p-2.5 font-mono text-xs text-foreground",
                className,
            )}
        >
            {children}
        </div>
    );
}

export function CodeInput({
    className,
    ...props
}: React.ComponentProps<"input">) {
    return (
        <input
            className={cn(
                "flex h-8 w-full rounded-md border border-input bg-transparent px-2.5 py-1 font-mono text-xs shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
                className,
            )}
            {...props}
        />
    );
}

export function CodeTextarea({
    className,
    ...props
}: React.ComponentProps<"textarea">) {
    return (
        <textarea
            className={cn(
                "flex min-h-16 w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 font-mono text-xs shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
                className,
            )}
            {...props}
        />
    );
}

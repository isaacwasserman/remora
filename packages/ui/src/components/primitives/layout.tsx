import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

export function Surface({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "rounded-lg border bg-card text-card-foreground",
                className,
            )}
        >
            {children}
        </div>
    );
}

export function Panel({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <div className={cn("flex h-full min-h-0 flex-col bg-card", className)}>
            {children}
        </div>
    );
}

export function PanelHeader({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "sticky top-0 z-10 flex items-center justify-between border-b bg-card/95 px-4 py-3 backdrop-blur-sm",
                className,
            )}
        >
            {children}
        </div>
    );
}

export function PanelBody({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <div className={cn("min-h-0 flex-1 overflow-y-auto p-4", className)}>
            {children}
        </div>
    );
}

export function ListRow({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "flex items-center justify-between gap-2 rounded-md px-2 py-1.5",
                className,
            )}
        >
            {children}
        </div>
    );
}

export function AddChip({
    children,
    onClick,
    className,
}: {
    children: ReactNode;
    onClick?: () => void;
    className?: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "flex items-center gap-1 rounded-sm border border-dashed border-border px-2 py-1 text-2xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground",
                className,
            )}
        >
            {children}
        </button>
    );
}

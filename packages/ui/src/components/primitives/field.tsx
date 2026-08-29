import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Label } from "../ui/label";

export function Field({
    label,
    htmlFor,
    children,
    className,
}: {
    label: ReactNode;
    htmlFor?: string;
    children: ReactNode;
    className?: string;
}) {
    return (
        <div className={cn("stack-tight", className)}>
            <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
            {children}
        </div>
    );
}

export function FieldLabel({
    children,
    htmlFor,
    className,
}: {
    children: ReactNode;
    htmlFor?: string;
    className?: string;
}) {
    return (
        <Label
            htmlFor={htmlFor}
            className={cn(
                "text-2xs font-semibold uppercase tracking-wider text-muted-foreground",
                className,
            )}
        >
            {children}
        </Label>
    );
}

export function Section({
    title,
    children,
    className,
}: {
    title?: ReactNode;
    children: ReactNode;
    className?: string;
}) {
    return (
        <section className={cn("stack-section", className)}>
            {title && (
                <h3 className="text-xs font-semibold text-foreground">
                    {title}
                </h3>
            )}
            {children}
        </section>
    );
}

export function SectionHeader({ children }: { children: ReactNode }) {
    return (
        <div className="text-xs font-semibold text-foreground">{children}</div>
    );
}

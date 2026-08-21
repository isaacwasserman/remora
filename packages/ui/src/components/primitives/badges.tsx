import type { StepType } from "@remoraflow/core";
import type { ComponentType, ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";

export function StepTypeBadge({
    type,
    label,
    icon: Icon,
    className,
}: {
    type: StepType | string;
    label: string;
    icon?: ComponentType<{ className?: string }>;
    className?: string;
}) {
    const tone = `text-tone-${type}`;
    return (
        <Badge
            variant="outline"
            className={cn(
                "gap-1.5 border-transparent bg-transparent px-0 font-semibold uppercase tracking-wide",
                tone,
                className,
            )}
        >
            {Icon && <Icon className="size-3.5" />}
            {label}
        </Badge>
    );
}

export function StatusBadge({
    status,
    children,
    className,
}: {
    status: "danger" | "warning" | "success" | "running" | "muted";
    children?: ReactNode;
    className?: string;
}) {
    return (
        <Badge
            variant="outline"
            className={cn(
                "border-transparent bg-transparent px-0 font-medium",
                `text-status-${status}`,
                className,
            )}
        >
            {children}
        </Badge>
    );
}

export function CountBadge({
    tone,
    children,
    className,
}: {
    tone: "danger" | "warning";
    children: ReactNode;
    className?: string;
}) {
    return (
        <Badge
            className={cn(
                "rounded-full px-1.5 py-0 font-medium",
                tone === "danger"
                    ? "bg-status-danger/10 text-status-danger"
                    : "bg-status-warning/10 text-status-warning",
                className,
            )}
        >
            {children}
        </Badge>
    );
}

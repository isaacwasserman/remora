import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Switch } from "../ui/switch";

export function ToggleField({
    label,
    checked,
    onCheckedChange,
    className,
}: {
    label: ReactNode;
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    className?: string;
}) {
    return (
        <div
            className={cn("flex items-center justify-between gap-2", className)}
        >
            <span className="text-2xs font-medium text-muted-foreground">
                {label}
            </span>
            <Switch checked={checked} onCheckedChange={onCheckedChange} />
        </div>
    );
}

import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { GitBranch, Repeat, Timer } from "lucide-react";
import { useEditContext } from "../edit-context";

interface GroupHeaderData {
  variant: "switch" | "loop" | "condition";
  description: string;
  // switch
  expression?: string;
  resolvedExpression?: unknown;
  // loop
  target?: string;
  resolvedTarget?: unknown;
  itemName?: string;
  // condition
  condition?: string;
}

const variantStyles = {
  switch: {
    container:
      "bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-700 hover:border-amber-500",
    label: "text-amber-600 dark:text-amber-400",
    mono: "text-amber-800 dark:text-amber-300",
    resolved: "text-emerald-700 dark:text-emerald-400",
    desc: "text-amber-700/70 dark:text-amber-400/60",
    handle: "!bg-amber-500",
    ring: "ring-amber-400",
  },
  loop: {
    container:
      "bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-700 hover:border-emerald-500",
    label: "text-emerald-600 dark:text-emerald-400",
    mono: "text-emerald-800 dark:text-emerald-300",
    resolved: "text-emerald-700 dark:text-emerald-400",
    desc: "text-emerald-700/70 dark:text-emerald-400/60",
    handle: "!bg-emerald-500",
    ring: "ring-emerald-400",
  },
  condition: {
    container:
      "bg-orange-50 dark:bg-orange-950/50 border-orange-300 dark:border-orange-700 hover:border-orange-500",
    label: "text-orange-600 dark:text-orange-400",
    mono: "text-orange-800 dark:text-orange-300",
    resolved: "text-emerald-700 dark:text-emerald-400",
    desc: "text-orange-700/70 dark:text-orange-400/60",
    handle: "!bg-orange-500",
    ring: "ring-orange-400",
  },
};

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export function GroupHeaderNode({ data, selected }: NodeProps) {
  const { isEditing } = useEditContext();
  const {
    variant,
    description,
    expression,
    resolvedExpression,
    target,
    resolvedTarget,
    itemName,
    condition,
  } = data as unknown as GroupHeaderData;
  const s = variantStyles[variant];

  return (
    <div
      className={`border-2 rounded-lg w-[280px] shadow-sm transition-colors duration-150 ${s.container} ${
        selected ? `ring-2 ${s.ring}` : ""
      }`}
    >
      <div className="px-3 py-2">
        {variant === "switch" && (
          <div className="flex items-center gap-1.5">
            <GitBranch className={`w-3.5 h-3.5 shrink-0 ${s.label}`} />
            <span
              className={`text-[10px] font-bold uppercase tracking-wide ${s.label} shrink-0`}
            >
              switch
            </span>
            <span className={`text-[11px] ${s.label}`}>on</span>
            <span
              className={`text-xs font-mono font-medium truncate ${
                resolvedExpression !== undefined ? s.resolved : s.mono
              }`}
              title={resolvedExpression !== undefined ? expression : undefined}
            >
              {resolvedExpression !== undefined
                ? formatValue(resolvedExpression)
                : expression}
            </span>
          </div>
        )}
        {variant === "loop" && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <Repeat className={`w-3.5 h-3.5 shrink-0 ${s.label}`} />
            <span
              className={`text-[10px] font-bold uppercase tracking-wide ${s.label} shrink-0`}
            >
              foreach
            </span>
            <span className={`text-xs font-mono font-medium ${s.mono}`}>
              {itemName}
            </span>
            <span className={`text-[11px] ${s.label}`}>in</span>
            <span
              className={`text-xs font-mono font-medium truncate ${
                resolvedTarget !== undefined ? s.resolved : s.mono
              }`}
              title={resolvedTarget !== undefined ? target : undefined}
            >
              {resolvedTarget !== undefined
                ? `[${Array.isArray(resolvedTarget) ? resolvedTarget.length : "?"} items]`
                : target}
            </span>
          </div>
        )}
        {variant === "condition" && (
          <div className="flex items-center gap-1.5">
            <Timer className={`w-3.5 h-3.5 shrink-0 ${s.label}`} />
            <span
              className={`text-[10px] font-bold uppercase tracking-wide ${s.label} shrink-0`}
            >
              wait until
            </span>
            <span
              className={`text-xs font-mono font-medium ${s.mono} truncate`}
            >
              {condition}
            </span>
          </div>
        )}
        {description && (
          <div className={`text-[11px] ${s.desc} mt-0.5 line-clamp-1`}>
            {description}
          </div>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className={
          isEditing
            ? "!w-3 !h-3 !bg-blue-400 hover:!bg-blue-500 !border-2 !border-background"
            : `${s.handle} !w-2 !h-2`
        }
      />
    </div>
  );
}

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
      "rf:bg-amber-50 rf:dark:bg-amber-950/50 rf:border-amber-300 rf:dark:border-amber-700 rf:hover:border-amber-500",
    label: "rf:text-amber-600 rf:dark:text-amber-400",
    mono: "rf:text-amber-800 rf:dark:text-amber-300",
    resolved: "rf:text-emerald-700 rf:dark:text-emerald-400",
    desc: "rf:text-amber-700/70 rf:dark:text-amber-400/60",
    handle: "rf:!bg-amber-500",
    ring: "rf:ring-amber-400",
  },
  loop: {
    container:
      "rf:bg-emerald-50 rf:dark:bg-emerald-950/50 rf:border-emerald-300 rf:dark:border-emerald-700 rf:hover:border-emerald-500",
    label: "rf:text-emerald-600 rf:dark:text-emerald-400",
    mono: "rf:text-emerald-800 rf:dark:text-emerald-300",
    resolved: "rf:text-emerald-700 rf:dark:text-emerald-400",
    desc: "rf:text-emerald-700/70 rf:dark:text-emerald-400/60",
    handle: "rf:!bg-emerald-500",
    ring: "rf:ring-emerald-400",
  },
  condition: {
    container:
      "rf:bg-orange-50 rf:dark:bg-orange-950/50 rf:border-orange-300 rf:dark:border-orange-700 rf:hover:border-orange-500",
    label: "rf:text-orange-600 rf:dark:text-orange-400",
    mono: "rf:text-orange-800 rf:dark:text-orange-300",
    resolved: "rf:text-emerald-700 rf:dark:text-emerald-400",
    desc: "rf:text-orange-700/70 rf:dark:text-orange-400/60",
    handle: "rf:!bg-orange-500",
    ring: "rf:ring-orange-400",
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
      className={`rf:border-2 rf:rounded-lg rf:w-[280px] rf:shadow-sm rf:transition-colors rf:duration-150 ${s.container} ${
        selected ? `ring-2 ${s.ring}` : ""
      }`}
    >
      <div className="rf:px-3 rf:py-2">
        {variant === "switch" && (
          <div className="rf:flex rf:items-center rf:gap-1.5">
            <GitBranch className={`rf:w-3.5 rf:h-3.5 rf:shrink-0 ${s.label}`} />
            <span
              className={`rf:text-[10px] rf:font-bold rf:uppercase rf:tracking-wide ${s.label} rf:shrink-0`}
            >
              switch
            </span>
            <span className={`rf:text-[11px] ${s.label}`}>on</span>
            <span
              className={`rf:text-xs rf:font-mono rf:font-medium rf:truncate ${
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
          <div className="rf:flex rf:items-center rf:gap-1.5 rf:flex-wrap">
            <Repeat className={`rf:w-3.5 rf:h-3.5 rf:shrink-0 ${s.label}`} />
            <span
              className={`rf:text-[10px] rf:font-bold rf:uppercase rf:tracking-wide ${s.label} rf:shrink-0`}
            >
              foreach
            </span>
            <span
              className={`rf:text-xs rf:font-mono rf:font-medium ${s.mono}`}
            >
              {itemName}
            </span>
            <span className={`rf:text-[11px] ${s.label}`}>in</span>
            <span
              className={`rf:text-xs rf:font-mono rf:font-medium rf:truncate ${
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
          <div className="rf:flex rf:items-center rf:gap-1.5">
            <Timer className={`rf:w-3.5 rf:h-3.5 rf:shrink-0 ${s.label}`} />
            <span
              className={`rf:text-[10px] rf:font-bold rf:uppercase rf:tracking-wide ${s.label} rf:shrink-0`}
            >
              wait until
            </span>
            <span
              className={`rf:text-xs rf:font-mono rf:font-medium ${s.mono} rf:truncate`}
            >
              {condition}
            </span>
          </div>
        )}
        {description && (
          <div className={`rf:text-[11px] ${s.desc} rf:mt-0.5 rf:line-clamp-1`}>
            {description}
          </div>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className={
          isEditing
            ? "rf:!w-3 rf:!h-3 rf:!bg-blue-400 rf:hover:!bg-blue-500 rf:!border-2 rf:!border-background"
            : `${s.handle} rf:!w-2 rf:!h-2`
        }
      />
    </div>
  );
}

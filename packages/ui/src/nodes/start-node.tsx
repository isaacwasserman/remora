import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";

export function StartNode({ selected }: NodeProps) {
  return (
    <div
      className={`rf:rounded-full rf:w-[60px] rf:h-[60px] rf:flex rf:items-center rf:justify-center rf:shadow-sm border rf:transition-all rf:duration-150 rf:bg-muted rf:border-border rf:hover:bg-accent ${selected ? "rf:ring-2 rf:ring-blue-400" : "rf:hover:ring-2 rf:hover:ring-ring"}`}
    >
      <span className="rf:text-xs rf:font-medium rf:text-muted-foreground">
        Start
      </span>
      <Handle
        type="source"
        position={Position.Bottom}
        className="rf:!w-2 rf:!h-2 rf:!bg-muted-foreground"
      />
    </div>
  );
}

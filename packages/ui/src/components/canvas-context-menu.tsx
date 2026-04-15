import type { WorkflowStep } from "@remoraflow/core";
import {
  Bot,
  FileOutput,
  GitBranch,
  Hand,
  Moon,
  Play,
  Repeat,
  Sparkles,
  Timer,
  Wrench,
} from "lucide-react";
import type { ComponentType } from "react";
import { useEffect, useRef } from "react";

export interface CanvasContextMenuProps {
  position: { x: number; y: number };
  canvasPosition: { x: number; y: number };
  onAddStep: (
    type: WorkflowStep["type"],
    position: { x: number; y: number },
  ) => void;
  onClose: () => void;
  targetNodeId?: string;
  onDeleteNode?: (nodeId: string) => void;
  onEditNode?: (nodeId: string) => void;
}

const STEP_TYPES: {
  type: WorkflowStep["type"];
  label: string;
  icon: ComponentType<{ className?: string }>;
}[] = [
  { type: "start", label: "Start", icon: Play },
  { type: "end", label: "End", icon: Hand },
  { type: "tool-call", label: "Tool Call", icon: Wrench },
  { type: "llm-prompt", label: "LLM Prompt", icon: Sparkles },
  { type: "extract-data", label: "Extract Data", icon: FileOutput },
  { type: "switch-case", label: "Switch Case", icon: GitBranch },
  { type: "for-each", label: "For Each", icon: Repeat },
  { type: "sleep", label: "Sleep", icon: Moon },
  { type: "wait-for-condition", label: "Wait for Condition", icon: Timer },
  { type: "agent-loop", label: "Agent Loop", icon: Bot },
];

export function CanvasContextMenu({
  position,
  canvasPosition,
  onAddStep,
  onClose,
  targetNodeId,
  onDeleteNode,
  onEditNode,
}: CanvasContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  const menuStyle: React.CSSProperties = {
    position: "fixed",
    left: position.x,
    top: position.y,
    zIndex: 50,
  };

  return (
    <div
      ref={menuRef}
      style={menuStyle}
      className="rf:bg-card border rf:border-border rf:rounded-lg rf:shadow-xl rf:py-1 rf:min-w-[180px] rf:text-sm"
    >
      {targetNodeId && (
        <>
          {onEditNode && (
            <button
              type="button"
              onClick={() => onEditNode(targetNodeId)}
              className="rf:w-full rf:px-3 rf:py-1.5 rf:text-left rf:text-foreground rf:hover:bg-muted/50 rf:transition-colors"
            >
              Edit Step
            </button>
          )}
          {onDeleteNode && (
            <button
              type="button"
              onClick={() => onDeleteNode(targetNodeId)}
              className="rf:w-full rf:px-3 rf:py-1.5 rf:text-left rf:text-red-600 rf:dark:text-red-400 rf:hover:bg-red-50 rf:dark:hover:bg-red-900/20 rf:transition-colors"
            >
              Delete Step
            </button>
          )}
          <div className="rf:border-t rf:border-border rf:my-1" />
        </>
      )}
      <div className="rf:px-3 rf:py-1 rf:text-[11px] rf:font-medium rf:uppercase rf:tracking-wide rf:text-muted-foreground">
        Add Step
      </div>
      {STEP_TYPES.map((entry) => (
        <button
          type="button"
          key={entry.type}
          onClick={() => onAddStep(entry.type, canvasPosition)}
          className="rf:w-full rf:px-3 rf:py-1.5 rf:text-left rf:text-foreground rf:hover:bg-muted/50 rf:transition-colors rf:flex rf:items-center rf:gap-2"
        >
          <entry.icon className="rf:w-3.5 rf:h-3.5 rf:text-muted-foreground rf:shrink-0" />
          {entry.label}
        </button>
      ))}
    </div>
  );
}

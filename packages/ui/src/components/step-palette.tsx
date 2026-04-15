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
import { useCallback, useState } from "react";

export interface StepPaletteProps {
  onAddStep: (type: WorkflowStep["type"]) => void;
}

interface StepTypeEntry {
  type: WorkflowStep["type"];
  label: string;
  color: string;
  icon: ComponentType<{ className?: string }>;
}

const STEP_TYPES: StepTypeEntry[] = [
  {
    type: "start",
    label: "Start",
    color: "rf:text-green-600 rf:dark:text-green-400",
    icon: Play,
  },
  {
    type: "end",
    label: "End",
    color: "rf:text-muted-foreground",
    icon: Hand,
  },
  {
    type: "tool-call",
    label: "Tool Call",
    color: "rf:text-blue-600 rf:dark:text-blue-400",
    icon: Wrench,
  },
  {
    type: "llm-prompt",
    label: "LLM Prompt",
    color: "rf:text-violet-600 rf:dark:text-violet-400",
    icon: Sparkles,
  },
  {
    type: "extract-data",
    label: "Extract Data",
    color: "rf:text-purple-600 rf:dark:text-purple-400",
    icon: FileOutput,
  },
  {
    type: "switch-case",
    label: "Switch Case",
    color: "rf:text-amber-600 rf:dark:text-amber-400",
    icon: GitBranch,
  },
  {
    type: "for-each",
    label: "For Each",
    color: "rf:text-emerald-600 rf:dark:text-emerald-400",
    icon: Repeat,
  },
  {
    type: "sleep",
    label: "Sleep",
    color: "rf:text-yellow-600 rf:dark:text-yellow-400",
    icon: Moon,
  },
  {
    type: "wait-for-condition",
    label: "Wait",
    color: "rf:text-orange-600 rf:dark:text-orange-400",
    icon: Timer,
  },
  {
    type: "agent-loop",
    label: "Agent Loop",
    color: "rf:text-teal-600 rf:dark:text-teal-400",
    icon: Bot,
  },
];

export function StepPalette({ onAddStep }: StepPaletteProps) {
  const [collapsed, setCollapsed] = useState(false);

  const onDragStart = useCallback(
    (event: React.DragEvent, type: WorkflowStep["type"]) => {
      event.dataTransfer.setData("rf:application/remora-step-type", type);
      event.dataTransfer.effectAllowed = "move";
    },
    [],
  );

  return (
    <div className="rf:bg-card border rf:border-border rf:rounded-lg rf:shadow-md rf:overflow-hidden rf:w-[160px]">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="rf:w-full rf:px-3 rf:py-1.5 rf:text-xs rf:font-medium rf:text-foreground rf:flex rf:items-center rf:justify-between rf:hover:bg-muted/50 rf:transition-colors"
      >
        <span>Add Steps</span>
        <span
          className={`rf:text-[10px] rf:text-muted-foreground rf:transition-transform ${collapsed ? "" : "rf:rotate-180"}`}
        >
          &#9650;
        </span>
      </button>
      {!collapsed && (
        <div className="rf:border-t rf:border-border">
          {STEP_TYPES.map((entry) => (
            <button
              type="button"
              key={entry.type}
              onClick={() => onAddStep(entry.type)}
              draggable
              onDragStart={(e) => onDragStart(e, entry.type)}
              className="rf:w-full rf:px-3 rf:py-1 rf:text-left rf:hover:bg-muted/50 rf:transition-colors rf:cursor-grab rf:active:cursor-grabbing rf:flex rf:items-center rf:gap-1.5"
            >
              <entry.icon
                className={`rf:w-3.5 rf:h-3.5 rf:shrink-0 ${entry.color}`}
              />
              <span
                className={`rf:text-[10px] rf:font-semibold rf:uppercase rf:tracking-wide ${entry.color}`}
              >
                {entry.label}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

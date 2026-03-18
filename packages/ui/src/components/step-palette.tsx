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
    color: "text-green-600 dark:text-green-400",
    icon: Play,
  },
  {
    type: "end",
    label: "End",
    color: "text-muted-foreground",
    icon: Hand,
  },
  {
    type: "tool-call",
    label: "Tool Call",
    color: "text-blue-600 dark:text-blue-400",
    icon: Wrench,
  },
  {
    type: "llm-prompt",
    label: "LLM Prompt",
    color: "text-violet-600 dark:text-violet-400",
    icon: Sparkles,
  },
  {
    type: "extract-data",
    label: "Extract Data",
    color: "text-purple-600 dark:text-purple-400",
    icon: FileOutput,
  },
  {
    type: "switch-case",
    label: "Switch Case",
    color: "text-amber-600 dark:text-amber-400",
    icon: GitBranch,
  },
  {
    type: "for-each",
    label: "For Each",
    color: "text-emerald-600 dark:text-emerald-400",
    icon: Repeat,
  },
  {
    type: "sleep",
    label: "Sleep",
    color: "text-yellow-600 dark:text-yellow-400",
    icon: Moon,
  },
  {
    type: "wait-for-condition",
    label: "Wait",
    color: "text-orange-600 dark:text-orange-400",
    icon: Timer,
  },
  {
    type: "agent-loop",
    label: "Agent Loop",
    color: "text-teal-600 dark:text-teal-400",
    icon: Bot,
  },
];

export function StepPalette({ onAddStep }: StepPaletteProps) {
  const [collapsed, setCollapsed] = useState(false);

  const onDragStart = useCallback(
    (event: React.DragEvent, type: WorkflowStep["type"]) => {
      event.dataTransfer.setData("application/remora-step-type", type);
      event.dataTransfer.effectAllowed = "move";
    },
    [],
  );

  return (
    <div className="bg-card border border-border rounded-lg shadow-md overflow-hidden w-[160px]">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="w-full px-3 py-1.5 text-xs font-medium text-foreground flex items-center justify-between hover:bg-muted/50 transition-colors"
      >
        <span>Add Steps</span>
        <span
          className={`text-[10px] text-muted-foreground transition-transform ${collapsed ? "" : "rotate-180"}`}
        >
          &#9650;
        </span>
      </button>
      {!collapsed && (
        <div className="border-t border-border">
          {STEP_TYPES.map((entry) => (
            <button
              type="button"
              key={entry.type}
              onClick={() => onAddStep(entry.type)}
              draggable
              onDragStart={(e) => onDragStart(e, entry.type)}
              className="w-full px-3 py-1 text-left hover:bg-muted/50 transition-colors cursor-grab active:cursor-grabbing flex items-center gap-1.5"
            >
              <entry.icon className={`w-3.5 h-3.5 shrink-0 ${entry.color}`} />
              <span
                className={`text-[10px] font-semibold uppercase tracking-wide ${entry.color}`}
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

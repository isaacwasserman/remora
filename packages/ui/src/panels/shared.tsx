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
import type React from "react";
import type { ComponentType } from "react";

const STEP_TYPE_META: Record<
  string,
  {
    label: string;
    color: string;
    icon: ComponentType<{ className?: string }>;
  }
> = {
  start: {
    label: "Start",
    color: "text-green-600 dark:text-green-400",
    icon: Play,
  },
  end: {
    label: "End",
    color: "text-muted-foreground",
    icon: Hand,
  },
  "tool-call": {
    label: "Tool Call",
    color: "text-blue-600 dark:text-blue-400",
    icon: Wrench,
  },
  "llm-prompt": {
    label: "LLM Prompt",
    color: "text-violet-600 dark:text-violet-400",
    icon: Sparkles,
  },
  "extract-data": {
    label: "Extract Data",
    color: "text-purple-600 dark:text-purple-400",
    icon: FileOutput,
  },
  "switch-case": {
    label: "Switch Case",
    color: "text-amber-600 dark:text-amber-400",
    icon: GitBranch,
  },
  "for-each": {
    label: "For Each",
    color: "text-emerald-600 dark:text-emerald-400",
    icon: Repeat,
  },
  sleep: {
    label: "Sleep",
    color: "text-yellow-600 dark:text-yellow-400",
    icon: Moon,
  },
  "wait-for-condition": {
    label: "Wait",
    color: "text-orange-600 dark:text-orange-400",
    icon: Timer,
  },
  "agent-loop": {
    label: "Agent Loop",
    color: "text-teal-600 dark:text-teal-400",
    icon: Bot,
  },
};

export function TypeBadge({ type }: { type: string }) {
  const meta = STEP_TYPE_META[type];
  if (!meta) {
    return (
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {type}
      </span>
    );
  }
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 shrink-0 ${meta.color}`}>
      <Icon className="w-3.5 h-3.5" />
      <span className="text-[10px] font-semibold uppercase tracking-wide">
        {meta.label}
      </span>
    </span>
  );
}

export function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-semibold text-foreground mb-2">{children}</div>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-medium text-muted-foreground mb-1">
      {children}
    </div>
  );
}

export function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="text-xs rounded-md p-2.5 whitespace-pre-wrap font-mono overflow-auto max-h-[200px] text-foreground bg-muted/60 border border-border/50">
      {children}
    </pre>
  );
}

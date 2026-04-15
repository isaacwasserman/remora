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
    color: "rf:text-green-600 rf:dark:text-green-400",
    icon: Play,
  },
  end: {
    label: "End",
    color: "rf:text-muted-foreground",
    icon: Hand,
  },
  "tool-call": {
    label: "Tool Call",
    color: "rf:text-blue-600 rf:dark:text-blue-400",
    icon: Wrench,
  },
  "llm-prompt": {
    label: "LLM Prompt",
    color: "rf:text-violet-600 rf:dark:text-violet-400",
    icon: Sparkles,
  },
  "extract-data": {
    label: "Extract Data",
    color: "rf:text-purple-600 rf:dark:text-purple-400",
    icon: FileOutput,
  },
  "switch-case": {
    label: "Switch Case",
    color: "rf:text-amber-600 rf:dark:text-amber-400",
    icon: GitBranch,
  },
  "for-each": {
    label: "For Each",
    color: "rf:text-emerald-600 rf:dark:text-emerald-400",
    icon: Repeat,
  },
  sleep: {
    label: "Sleep",
    color: "rf:text-yellow-600 rf:dark:text-yellow-400",
    icon: Moon,
  },
  "wait-for-condition": {
    label: "Wait",
    color: "rf:text-orange-600 rf:dark:text-orange-400",
    icon: Timer,
  },
  "agent-loop": {
    label: "Agent Loop",
    color: "rf:text-teal-600 rf:dark:text-teal-400",
    icon: Bot,
  },
};

export function TypeBadge({ type }: { type: string }) {
  const meta = STEP_TYPE_META[type];
  if (!meta) {
    return (
      <span className="rf:text-[10px] rf:font-semibold rf:uppercase rf:tracking-wide rf:text-muted-foreground">
        {type}
      </span>
    );
  }
  const Icon = meta.icon;
  return (
    <span
      className={`rf:inline-flex rf:items-center rf:gap-1.5 rf:shrink-0 ${meta.color}`}
    >
      <Icon className="rf:w-3.5 rf:h-3.5" />
      <span className="rf:text-[10px] rf:font-semibold rf:uppercase rf:tracking-wide">
        {meta.label}
      </span>
    </span>
  );
}

export function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="rf:text-xs rf:font-semibold rf:text-foreground">
      {children}
    </div>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="rf:text-[11px] rf:font-semibold rf:uppercase rf:tracking-wider rf:text-muted-foreground rf:mb-1.5">
      {children}
    </div>
  );
}

export function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="rf:text-xs rf:rounded-md rf:p-2.5 rf:whitespace-pre-wrap rf:font-mono rf:overflow-auto rf:max-h-[200px] rf:text-foreground rf:bg-muted/60 border rf:border-border/50">
      {children}
    </pre>
  );
}

import {
	Bot,
	FileOutput,
	GitBranch,
	Moon,
	Play,
	Repeat,
	Sparkles,
	Square,
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
	start: { label: "Start", color: "text-green-500", icon: Play },
	end: { label: "End", color: "text-muted-foreground", icon: Square },
	"tool-call": { label: "Tool Call", color: "text-blue-500", icon: Wrench },
	"llm-prompt": {
		label: "LLM Prompt",
		color: "text-violet-500",
		icon: Sparkles,
	},
	"extract-data": {
		label: "Extract Data",
		color: "text-purple-500",
		icon: FileOutput,
	},
	"switch-case": {
		label: "Switch Case",
		color: "text-amber-500",
		icon: GitBranch,
	},
	"for-each": {
		label: "For Each",
		color: "text-emerald-500",
		icon: Repeat,
	},
	sleep: { label: "Sleep", color: "text-amber-500", icon: Moon },
	"wait-for-condition": {
		label: "Wait For Condition",
		color: "text-orange-500",
		icon: Timer,
	},
	"agent-loop": { label: "Agent Loop", color: "text-teal-500", icon: Bot },
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
		<span className={`flex items-center gap-1.5 shrink-0 ${meta.color}`}>
			<Icon className="w-3.5 h-3.5" />
			<span className="text-[10px] font-semibold uppercase tracking-wide">
				{meta.label}
			</span>
		</span>
	);
}

export function Label({ children }: { children: React.ReactNode }) {
	return (
		<div className="text-[11px] font-medium uppercase tracking-wide mb-0.5 text-muted-foreground">
			{children}
		</div>
	);
}

export function Code({ children }: { children: React.ReactNode }) {
	return (
		<pre className="text-xs rounded p-2 whitespace-pre-wrap font-mono overflow-auto max-h-[200px] text-foreground bg-muted">
			{children}
		</pre>
	);
}

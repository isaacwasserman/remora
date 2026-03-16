import type { WorkflowStep } from "@remoraflow/core";
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
	{ type: "end", label: "End", icon: Square },
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
			className="bg-card border border-border rounded-lg shadow-xl py-1 min-w-[180px] text-sm"
		>
			{targetNodeId && (
				<>
					{onEditNode && (
						<button
							type="button"
							onClick={() => onEditNode(targetNodeId)}
							className="w-full px-3 py-1.5 text-left text-foreground hover:bg-muted/50 transition-colors"
						>
							Edit Step
						</button>
					)}
					{onDeleteNode && (
						<button
							type="button"
							onClick={() => onDeleteNode(targetNodeId)}
							className="w-full px-3 py-1.5 text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
						>
							Delete Step
						</button>
					)}
					<div className="border-t border-border my-1" />
				</>
			)}
			<div className="px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
				Add Step
			</div>
			{STEP_TYPES.map((entry) => (
				<button
					type="button"
					key={entry.type}
					onClick={() => onAddStep(entry.type, canvasPosition)}
					className="w-full px-3 py-1.5 text-left text-foreground hover:bg-muted/50 transition-colors flex items-center gap-2"
				>
					<entry.icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
					{entry.label}
				</button>
			))}
		</div>
	);
}

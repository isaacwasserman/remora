import {
    STEP_TYPES as ALL_STEP_TYPES,
    isStepTypeAllowed,
    type RemoraflowFeatures,
    type StepType,
    type WorkflowStep,
} from "@remoraflow/core";
import { useEffect, useRef } from "react";
import { STEP_UI } from "../step-ui/registry";

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
    onSetInitialStep?: (nodeId: string) => void;
    isInitialStep?: boolean;
    features: RemoraflowFeatures;
}

const PALETTE_ENTRIES = ALL_STEP_TYPES.map((type) => {
    const ui = STEP_UI[type as StepType];
    return { type, label: ui.label, icon: ui.icon, order: ui.paletteOrder };
}).sort((a, b) => a.order - b.order);

export function CanvasContextMenu({
    position,
    canvasPosition,
    onAddStep,
    onClose,
    targetNodeId,
    onDeleteNode,
    onEditNode,
    onSetInitialStep,
    isInitialStep,
    features,
}: CanvasContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);
    const available = PALETTE_ENTRIES.filter((entry) =>
        isStepTypeAllowed(entry.type, features),
    );

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (
                menuRef.current &&
                !menuRef.current.contains(e.target as Node)
            ) {
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
                    {onSetInitialStep && !isInitialStep && (
                        <button
                            type="button"
                            onClick={() => {
                                onSetInitialStep(targetNodeId);
                                onClose();
                            }}
                            className="w-full px-3 py-1.5 text-left text-foreground hover:bg-muted/50 transition-colors"
                        >
                            Set as Entry Point
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
            {available.map((entry) => (
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

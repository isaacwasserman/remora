import {
    STEP_TYPES as ALL_STEP_TYPES,
    isStepTypeAllowed,
    type RemoraflowFeatures,
    type StepType,
    type WorkflowStep,
} from "@remoraflow/core";
import { useCallback, useState } from "react";
import { STEP_UI } from "../step-ui/registry";
import { toneColor } from "../step-ui/tone-styles";

export interface StepPaletteProps {
    onAddStep: (type: WorkflowStep["type"]) => void;
    features: RemoraflowFeatures;
}

const PALETTE_ENTRIES = ALL_STEP_TYPES.map((type) => {
    const ui = STEP_UI[type as StepType];
    return {
        type,
        label: ui.label,
        icon: ui.icon,
        tone: ui.tone,
        order: ui.paletteOrder,
    };
}).sort((a, b) => a.order - b.order);

export function StepPalette({ onAddStep, features }: StepPaletteProps) {
    const [collapsed, setCollapsed] = useState(false);
    const available = PALETTE_ENTRIES.filter((entry) =>
        isStepTypeAllowed(entry.type, features),
    );

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
                    {available.map((entry) => (
                        <button
                            type="button"
                            key={entry.type}
                            onClick={() => onAddStep(entry.type)}
                            draggable
                            onDragStart={(e) => onDragStart(e, entry.type)}
                            className="w-full px-3 py-1 text-left hover:bg-muted/50 transition-colors cursor-grab active:cursor-grabbing flex items-center gap-1.5"
                        >
                            <entry.icon
                                className="w-3.5 h-3.5 shrink-0"
                                style={{ color: toneColor(entry.tone) }}
                            />
                            <span
                                className="text-[10px] font-semibold uppercase tracking-wide"
                                style={{ color: toneColor(entry.tone) }}
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

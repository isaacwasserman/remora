import type { ExecutionState } from "@remoraflow/core";
import { JsonViewer, ReplaySlider } from "@remoraflow/ui";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

interface OutputPanelProps {
    executionState: ExecutionState | null;
    stateHistory: ExecutionState[];
    isRunning: boolean;
    replayIndex: number | null;
    onSeek: (index: number) => void;
    onGoLive: () => void;
}

export function OutputPanel({
    executionState,
    stateHistory,
    isRunning,
    replayIndex,
    onSeek,
    onGoLive,
}: OutputPanelProps) {
    const [expanded, setExpanded] = useState(true);

    if (!executionState && stateHistory.length === 0) return null;

    const output = executionState?.output;
    const error = executionState?.error;
    const status = executionState?.status;
    const outputJson =
        !error && output !== undefined
            ? JSON.stringify(output, null, 2)
            : undefined;

    return (
        <div className="border-t border-border bg-card shrink-0">
            <ReplaySlider
                stateHistory={stateHistory}
                replayIndex={replayIndex}
                isRunning={isRunning}
                onSeek={onSeek}
                onGoLive={onGoLive}
            />
            <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                className="w-full flex items-center justify-between px-4 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
                <span>
                    Output
                    {status && (
                        <span className="ml-2 text-[10px] uppercase tracking-wide">
                            ({status})
                        </span>
                    )}
                </span>
                {expanded ? (
                    <ChevronDown className="size-3.5" />
                ) : (
                    <ChevronUp className="size-3.5" />
                )}
            </button>
            {expanded && (
                <div className="px-4 pb-3 space-y-2">
                    {error && (
                        <div
                            role="alert"
                            className="text-xs p-2.5 rounded-md bg-destructive/10 text-destructive border border-destructive/20"
                        >
                            <div className="font-semibold font-mono">
                                {error.code}
                            </div>
                            <div className="mt-1 leading-relaxed">
                                {error.message}
                            </div>
                        </div>
                    )}
                    {outputJson && (
                        <JsonViewer
                            value={outputJson}
                            className="max-h-[200px]"
                        />
                    )}
                </div>
            )}
        </div>
    );
}

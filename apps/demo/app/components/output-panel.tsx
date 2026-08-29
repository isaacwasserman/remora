import type { ExecutionState } from "@remoraflow/core";
import { JsonViewer, ReplaySlider } from "@remoraflow/ui";
import { Check, ChevronDown, ChevronUp, Copy } from "lucide-react";
import { useCallback, useRef, useState } from "react";

const MIN_HEIGHT = 60;
const MAX_HEIGHT = 600;
const DEFAULT_HEIGHT = 200;

function CopyButton({ text, label }: { text: string; label: string }) {
    const [copied, setCopied] = useState(false);

    const copy = useCallback(() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    }, [text]);

    return (
        <button
            type="button"
            onClick={(e) => {
                e.stopPropagation();
                copy();
            }}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        >
            {copied ? (
                <Check className="size-3 text-green-500" />
            ) : (
                <Copy className="size-3" />
            )}
            <span className="text-xs">{copied ? "Copied" : label}</span>
        </button>
    );
}

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
    const [height, setHeight] = useState(DEFAULT_HEIGHT);
    const dragState = useRef<{ startY: number; startHeight: number } | null>(
        null,
    );

    const onPointerDown = useCallback(
        (e: React.PointerEvent) => {
            e.preventDefault();
            dragState.current = { startY: e.clientY, startHeight: height };
            const target = e.currentTarget as HTMLElement;
            target.setPointerCapture(e.pointerId);
        },
        [height],
    );

    const onPointerMove = useCallback((e: React.PointerEvent) => {
        if (!dragState.current) return;
        const delta = dragState.current.startY - e.clientY;
        setHeight(
            Math.min(
                MAX_HEIGHT,
                Math.max(MIN_HEIGHT, dragState.current.startHeight + delta),
            ),
        );
    }, []);

    const onPointerUp = useCallback(() => {
        dragState.current = null;
    }, []);

    if (!executionState && stateHistory.length === 0) return null;

    const output = executionState?.output;
    const error = executionState?.error;
    const status = executionState?.status;
    const outputJson =
        !error && output !== undefined
            ? JSON.stringify(output, null, 2)
            : undefined;

    return (
        <div className="border-t border-border bg-card shrink-0 relative">
            {expanded && (
                <div
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    className="absolute inset-x-0 -top-1 h-2 cursor-ns-resize z-10"
                />
            )}
            <ReplaySlider
                stateHistory={stateHistory}
                replayIndex={replayIndex}
                isRunning={isRunning}
                onSeek={onSeek}
                onGoLive={onGoLive}
            />
            <div className="flex items-center justify-between px-4 py-1.5">
                <button
                    type="button"
                    onClick={() => setExpanded((e) => !e)}
                    className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
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
                <div className="flex items-center gap-1">
                    {outputJson && (
                        <CopyButton text={outputJson} label="Copy output" />
                    )}
                    {executionState && (
                        <CopyButton
                            text={JSON.stringify(executionState, null, 2)}
                            label="Copy full state"
                        />
                    )}
                </div>
            </div>
            {expanded && (
                <div
                    className="px-4 pb-3 flex flex-col gap-2"
                    style={{ height }}
                >
                    {error && (
                        <div
                            role="alert"
                            className="text-xs p-2.5 rounded-md bg-destructive/10 text-destructive border border-destructive/20 shrink-0"
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
                        <div className="min-h-0 flex-1 [&_.cm-editor]:!h-full [&_.cm-editor]:!max-h-none [&_.cm-scroller]:!max-h-none">
                            <JsonViewer value={outputJson} className="h-full" />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

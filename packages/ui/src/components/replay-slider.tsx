import type { ExecutionState } from "@remoraflow/core";
import type React from "react";
import { Button } from "./ui/button";

export interface ReplaySliderProps {
  stateHistory: ExecutionState[];
  replayIndex: number | null;
  isRunning: boolean;
  onSeek: (index: number) => void;
  onGoLive: () => void;
}

export function ReplaySlider({
  stateHistory,
  replayIndex,
  isRunning,
  onSeek,
  onGoLive,
}: ReplaySliderProps) {
  if (stateHistory.length <= 1) return null;

  const currentIndex = replayIndex ?? stateHistory.length - 1;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSeek(Number(e.target.value));
  };

  const latestStatus = stateHistory[stateHistory.length - 1]?.status;
  const base =
    "w-[72px] h-[24px] text-[11px] font-medium rounded flex items-center justify-center";

  let badge: React.ReactNode;
  if (replayIndex !== null) {
    badge = (
      <Button
        variant="outline"
        size="xs"
        onClick={onGoLive}
        className="w-[72px]"
      >
        Live
      </Button>
    );
  } else if (isRunning) {
    badge = (
      <span className={`${base} text-green-600 dark:text-green-400 gap-1`}>
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
        Live
      </span>
    );
  } else if (latestStatus === "completed") {
    badge = (
      <span className={`${base} text-green-600 dark:text-green-400`}>
        Complete
      </span>
    );
  } else if (latestStatus === "failed") {
    badge = (
      <span className={`${base} text-red-600 dark:text-red-400`}>Failed</span>
    );
  } else {
    badge = <span className={base} />;
  }

  return (
    <div className="bg-card dark:bg-secondary/40 border-t border-border px-4 py-2 flex items-center gap-3 shrink-0">
      <input
        type="range"
        min={0}
        max={stateHistory.length - 1}
        value={currentIndex}
        onChange={handleChange}
        className="flex-1 h-1.5 accent-primary"
      />
      <span className="text-xs text-muted-foreground tabular-nums min-w-[60px] text-right">
        {currentIndex + 1} / {stateHistory.length}
      </span>
      {badge}
    </div>
  );
}

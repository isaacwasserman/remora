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
    "rf:w-[72px] rf:h-[24px] rf:text-[11px] rf:font-medium rounded rf:flex rf:items-center rf:justify-center";

  let badge: React.ReactNode;
  if (replayIndex !== null) {
    badge = (
      <Button
        variant="outline"
        size="xs"
        onClick={onGoLive}
        className="rf:w-[72px]"
      >
        Live
      </Button>
    );
  } else if (isRunning) {
    badge = (
      <span
        className={`${base} rf:text-green-600 rf:dark:text-green-400 rf:gap-1`}
      >
        <span className="rf:w-1.5 rf:h-1.5 rf:rounded-full rf:bg-green-500 rf:animate-pulse" />
        Live
      </span>
    );
  } else if (latestStatus === "completed") {
    badge = (
      <span className={`${base} rf:text-green-600 rf:dark:text-green-400`}>
        Complete
      </span>
    );
  } else if (latestStatus === "failed") {
    badge = (
      <span className={`${base} rf:text-red-600 rf:dark:text-red-400`}>
        Failed
      </span>
    );
  } else {
    badge = <span className={base} />;
  }

  return (
    <div className="rf:bg-card rf:dark:bg-secondary/40 rf:border-t rf:border-border rf:px-4 rf:py-2 rf:flex rf:items-center rf:gap-3 rf:shrink-0">
      <input
        type="range"
        min={0}
        max={stateHistory.length - 1}
        value={currentIndex}
        onChange={handleChange}
        className="rf:flex-1 rf:h-1.5 rf:accent-primary"
      />
      <span className="rf:text-xs rf:text-muted-foreground rf:tabular-nums rf:min-w-[60px] rf:text-right">
        {currentIndex + 1} / {stateHistory.length}
      </span>
      {badge}
    </div>
  );
}

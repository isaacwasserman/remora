import * as capcon from "capture-console";
import type { LogLine } from "./types";

export async function* withLogCapture<TObjective>(
    objectiveFn: () => AsyncGenerator<TObjective>,
    { silence }: { silence?: boolean },
) {
    const logLines: LogLine[] = [];
    capcon.startCapture(process.stdout, { quiet: silence }, (line) => {
        logLines.push({ timestamp: new Date(), text: line });
    });
    capcon.startCapture(process.stderr, { quiet: silence }, (line) => {
        logLines.push({ timestamp: new Date(), text: line });
    });

    try {
        for await (const objective of objectiveFn()) {
            yield { objective, logs: logLines };
        }
    } finally {
        capcon.stopCapture(process.stdout);
        capcon.stopCapture(process.stderr);
    }
}

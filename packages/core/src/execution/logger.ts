import type { LogLine } from "./types";

class LogRingBuffer {
    private maxLogLines: number;
    private maxLogLineLength: number;
    private logBuffer: LogLine[];
    private logCursor: number = 0;
    private totalLines: number = 0;
    private readonly unlimited: boolean;

    constructor(config: { maxLogLines: number; maxLogLineLength: number }) {
        this.maxLogLineLength = config.maxLogLineLength;
        this.maxLogLines = config.maxLogLines;
        this.unlimited = this.maxLogLines === 0;
        this.logBuffer = this.unlimited ? [] : new Array(this.maxLogLines);
    }

    private truncateLogText(text: string): string {
        if (text.length <= this.maxLogLineLength) return text;
        const ellipses = "...";
        return (
            text.slice(0, this.maxLogLineLength - ellipses.length) + ellipses
        );
    }

    public addLogLine(text: string) {
        const entry: LogLine = {
            timestamp: new Date(),
            text: this.truncateLogText(text),
        };
        if (this.unlimited) {
            this.logBuffer.push(entry);
            this.totalLines++;
            return;
        }
        this.logBuffer[this.logCursor] = entry;
        this.totalLines++;
        this.logCursor = (this.logCursor + 1) % this.maxLogLines;
    }

    private getSortedLines() {
        if (this.unlimited) {
            return [...this.logBuffer];
        }
        const unpaddedLines = this.logBuffer.slice(0, this.totalLines);
        return [
            ...unpaddedLines.slice(this.logCursor),
            ...unpaddedLines.slice(0, this.logCursor),
        ];
    }

    public getLogs() {
        return {
            logs: this.getSortedLines(),
            totalLogs: this.totalLines,
        };
    }
}
export async function* withLogCapture<TObjective>(
    objectiveFn: () => AsyncGenerator<TObjective>,
    {
        silence,
        maxLogLines,
        maxLogLineLength,
    }: { silence?: boolean; maxLogLines: number; maxLogLineLength: number },
) {
    const logBuffer = new LogRingBuffer({ maxLogLineLength, maxLogLines });
    const capcon = await import("capture-console");
    capcon.startCapture(process.stdout, { quiet: silence }, (line) => {
        logBuffer.addLogLine(line);
    });
    capcon.startCapture(process.stderr, { quiet: silence }, (line) => {
        logBuffer.addLogLine(line);
    });

    try {
        for await (const objective of objectiveFn()) {
            yield { objective, logs: logBuffer.getLogs() };
        }
    } finally {
        capcon.stopCapture(process.stdout);
        capcon.stopCapture(process.stderr);
    }
}

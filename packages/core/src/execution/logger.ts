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

interface RunCapture {
    buffer: LogRingBuffer;
    silence: boolean;
}

type CaptureStore = import("node:async_hooks").AsyncLocalStorage<RunCapture>;

let captureStore: Promise<CaptureStore> | undefined;

const decoder = new TextDecoder();

function chunkText(chunk: unknown): string {
    if (typeof chunk === "string") return chunk;
    if (chunk instanceof Uint8Array) return decoder.decode(chunk);
    return String(chunk);
}

/**
 * Routes every write on `stream` to the log buffer of the run that made it.
 * Writes made outside a run pass through untouched.
 */
function routeWritesToRuns(stream: NodeJS.WriteStream, store: CaptureStore) {
    const write = stream.write;
    stream.write = function (
        this: NodeJS.WriteStream,
        chunk: unknown,
        ...rest: unknown[]
    ): boolean {
        const run = store.getStore();
        if (run) {
            run.buffer.addLogLine(chunkText(chunk));
            if (run.silence) {
                const callback = rest.find(
                    (arg): arg is () => void => typeof arg === "function",
                );
                if (callback) queueMicrotask(callback);
                return true;
            }
        }
        return Reflect.apply(write, this, [chunk, ...rest]);
    } as NodeJS.WriteStream["write"];
}

/**
 * Hooks stdout and stderr once per process. Each run is told apart by its
 * async context rather than by hooking and unhooking the streams, so runs that
 * overlap never see each other's output.
 */
function getCaptureStore(): Promise<CaptureStore> {
    captureStore ??= import("node:async_hooks").then(
        ({ AsyncLocalStorage }) => {
            const store = new AsyncLocalStorage<RunCapture>();
            routeWritesToRuns(process.stdout, store);
            routeWritesToRuns(process.stderr, store);
            return store;
        },
    );
    return captureStore;
}

export async function* withLogCapture<TObjective>(
    objectiveFn: () => AsyncGenerator<TObjective>,
    {
        silence,
        maxLogLines,
        maxLogLineLength,
    }: { silence?: boolean; maxLogLines: number; maxLogLineLength: number },
) {
    const run: RunCapture = {
        buffer: new LogRingBuffer({ maxLogLineLength, maxLogLines }),
        silence: silence ?? false,
    };
    const store = await getCaptureStore();
    const objectives = objectiveFn();

    try {
        while (true) {
            const step = await store.run(run, () => objectives.next());
            if (step.done) return;
            yield { objective: step.value, logs: run.buffer.getLogs() };
        }
    } finally {
        await store.run(run, () => objectives.return(undefined));
    }
}

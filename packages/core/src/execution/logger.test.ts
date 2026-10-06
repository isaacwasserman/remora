import { describe, expect, test } from "bun:test";
import { withLogCapture } from "./logger";

const LIMITS = { silence: true, maxLogLines: 0, maxLogLineLength: 1000 };

async function* steps(name: string, count: number): AsyncGenerator<number> {
    for (let i = 1; i <= count; i++) {
        process.stdout.write(`${name}${i}\n`);
        await Bun.sleep(1);
        yield i;
    }
}

async function lastLogs(
    run: AsyncGenerator<{ logs: { logs: { text: string }[] } }>,
): Promise<string[]> {
    let texts: string[] = [];
    for await (const captured of run) {
        texts = captured.logs.logs.map((line) => line.text);
    }
    return texts;
}

describe("withLogCapture", () => {
    test("keeps the output of overlapping runs apart", async () => {
        const [a, b] = await Promise.all([
            lastLogs(withLogCapture(() => steps("a", 3), LIMITS)),
            lastLogs(withLogCapture(() => steps("b", 2), LIMITS)),
        ]);

        expect(a).toEqual(["a1\n", "a2\n", "a3\n"]);
        expect(b).toEqual(["b1\n", "b2\n"]);
    });

    test("leaves out what the consumer writes between steps", async () => {
        const run = withLogCapture(() => steps("step", 2), LIMITS);
        let texts: string[] = [];
        for await (const captured of run) {
            process.stderr.write("between steps\n");
            texts = captured.logs.logs.map((line) => line.text);
        }

        expect(texts).toEqual(["step1\n", "step2\n"]);
    });

    test("still completes a silenced write's callback", async () => {
        async function* awaitsWrite(): AsyncGenerator<number> {
            await new Promise<void>((resolve) =>
                process.stdout.write("quiet\n", () => resolve()),
            );
            yield 1;
        }

        expect(await lastLogs(withLogCapture(awaitsWrite, LIMITS))).toEqual([
            "quiet\n",
        ]);
    });
});

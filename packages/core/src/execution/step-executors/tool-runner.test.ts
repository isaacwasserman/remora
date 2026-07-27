import { describe, expect, test } from "bun:test";
import { tool } from "ai";
import { type } from "arktype";
import { runTool } from "./tool-runner";

const options = { toolCallId: "call-1", messages: [] };

describe("runTool", () => {
    test("returns a synchronously-produced value", async () => {
        const sync = tool({
            inputSchema: type({}),
            execute: () => "sync",
        });
        expect(await runTool<unknown, string>(sync, {}, options)).toBe("sync");
    });

    test("awaits a promise result", async () => {
        const deferred = tool({
            inputSchema: type({}),
            execute: async () => "async",
        });
        expect(await runTool<unknown, string>(deferred, {}, options)).toBe(
            "async",
        );
    });

    test("drains an async iterable and returns the last chunk", async () => {
        const streaming = tool({
            inputSchema: type({}),
            execute: async function* () {
                yield 1;
                yield 2;
                yield 3;
            },
        });
        expect(await runTool<unknown, number>(streaming, {}, options)).toBe(3);
    });

    test("returns undefined when the tool has no execute function", async () => {
        const inert = tool({ inputSchema: type({}) });
        expect(await runTool(inert, {}, options)).toBeUndefined();
    });

    test("passes input through to the execute function", async () => {
        const seen: unknown[] = [];
        const echo = tool({
            inputSchema: type({ a: "number" }),
            execute: (input) => {
                seen.push(input);
                return "ok";
            },
        });
        await runTool(echo, { a: 1 }, options);
        expect(seen).toEqual([{ a: 1 }]);
    });

    test("propagates errors thrown by the tool", async () => {
        const boom = tool({
            inputSchema: type({}),
            execute: (): string => {
                throw new Error("boom");
            },
        });
        await expect(runTool(boom, {}, options)).rejects.toThrow("boom");
    });
});

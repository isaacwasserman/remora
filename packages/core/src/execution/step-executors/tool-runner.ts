/** biome-ignore-all lint/suspicious/noExplicitAny: Necessary for type inference. */
import type { AnyTool, ToolExecutionOptions } from "../../types";

function isAsyncIterable<T>(x: unknown): x is AsyncIterable<T> {
    return x != null && typeof (x as any)[Symbol.asyncIterator] === "function";
}

function isPromiseLike<T>(x: unknown): x is PromiseLike<T> {
    return x != null && typeof (x as any).then === "function";
}

export async function runTool<TInput, TOutput>(
    t: AnyTool,
    input: TInput,
    options: ToolExecutionOptions,
): Promise<TOutput | undefined> {
    if (!t.execute) return undefined;

    const result = t.execute(input, options as any);

    if (isAsyncIterable<TOutput>(result)) {
        let last: TOutput | undefined;
        for await (const chunk of result) {
            last = chunk;
        }
        return last;
    }

    if (isPromiseLike<TOutput>(result)) {
        return await result;
    }

    return result as TOutput | undefined;
}
